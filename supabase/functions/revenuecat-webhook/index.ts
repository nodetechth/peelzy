import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLUS_ENTITLEMENT_ID = Deno.env.get('REVENUECAT_PLUS_ENTITLEMENT_ID') ?? 'plus';

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  transaction_id?: string;
  original_transaction_id?: string;
};

function isUuid(value: string | undefined | null): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function getEventId(event: RevenueCatEvent): string {
  return event.id
    ?? [event.type, event.app_user_id, event.transaction_id, event.original_transaction_id, event.expiration_at_ms]
      .filter(Boolean)
      .join(':');
}

function getSubscriptionStatus(event: RevenueCatEvent, hasActiveEntitlement: boolean): string {
  switch (event.type) {
    case 'EXPIRATION':
      return 'expired';
    case 'REFUND':
      return 'refunded';
    case 'BILLING_ISSUE':
      return hasActiveEntitlement ? 'active' : 'billing_issue';
    case 'CANCELLATION':
      return hasActiveEntitlement ? 'canceled_active' : 'canceled';
    default:
      return hasActiveEntitlement ? 'active' : 'inactive';
  }
}

function hasPaidAccess(event: RevenueCatEvent): boolean {
  if (event.type === 'EXPIRATION' || event.type === 'REFUND') {
    return false;
  }

  if (event.entitlement_ids?.length && !event.entitlement_ids.includes(PLUS_ENTITLEMENT_ID)) {
    return false;
  }

  if (!event.expiration_at_ms) {
    return true;
  }

  return event.expiration_at_ms > Date.now();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const expectedAuthHeader = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER');
    if (!expectedAuthHeader) {
      return new Response(JSON.stringify({ error: 'Missing webhook authentication configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.headers.get('authorization') !== expectedAuthHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const event = body.event as RevenueCatEvent | undefined;

    if (!event) {
      return new Response(JSON.stringify({ error: 'Missing RevenueCat event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventId = getEventId(event);
    const appUserId = event.app_user_id ?? event.original_app_user_id;
    const userId = isUuid(appUserId) ? appUserId : null;

    const { error: eventInsertError } = await adminClient
      .from('subscription_webhook_events')
      .insert({
        id: eventId,
        provider: 'revenuecat',
        event_type: event.type ?? 'unknown',
        user_id: userId,
      });

    if (eventInsertError) {
      if (eventInsertError.code === '23505') {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw eventInsertError;
    }

    if (!appUserId) {
      return new Response(JSON.stringify({ ok: true, ignored: 'missing_app_user_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paidAccess = hasPaidAccess(event);
    const subscriptionStatus = getSubscriptionStatus(event, paidAccess);
    const currentPeriodEnd = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    const updatePayload = {
      plan: paidAccess ? 'paid' : 'free',
      subscription_provider: 'revenuecat',
      revenuecat_app_user_id: appUserId,
      apple_original_transaction_id: event.original_transaction_id ?? null,
      revenuecat_product_id: event.product_id ?? null,
      revenuecat_entitlement_status: paidAccess ? 'active' : 'inactive',
      subscription_status: subscriptionStatus,
      subscription_current_period_end: currentPeriodEnd,
    };

    const query = userId
      ? adminClient.from('user_profiles').update(updatePayload).eq('id', userId)
      : adminClient.from('user_profiles').update(updatePayload).eq('revenuecat_app_user_id', appUserId);
    const { error: profileUpdateError } = await query;

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    return new Response(JSON.stringify({ ok: true, plan: updatePayload.plan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
