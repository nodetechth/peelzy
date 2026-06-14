import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLUS_ENTITLEMENT_ID = Deno.env.get('REVENUECAT_PLUS_ENTITLEMENT_ID') ?? 'plus';

type RevenueCatSubscriber = {
  subscriber?: {
    entitlements?: Record<string, {
      expires_date?: string | null;
      product_identifier?: string | null;
      purchase_date?: string | null;
    }>;
    subscriptions?: Record<string, {
      expires_date?: string | null;
      original_purchase_date?: string | null;
      original_transaction_id?: string | null;
      store_transaction_id?: string | null;
    }>;
  };
};

function isFutureDate(value?: string | null): boolean {
  if (!value) return true;
  return new Date(value).getTime() > Date.now();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const revenueCatSecretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!revenueCatSecretKey) {
      return new Response(JSON.stringify({ error: 'Missing RevenueCat secret key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        headers: {
          Authorization: `Bearer ${revenueCatSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'RevenueCat sync failed' }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const revenueCatData = await response.json() as RevenueCatSubscriber;
    const entitlement = revenueCatData.subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];
    const productId = entitlement?.product_identifier ?? null;
    const subscription = productId
      ? revenueCatData.subscriber?.subscriptions?.[productId]
      : null;
    const expiresDate = entitlement?.expires_date ?? subscription?.expires_date ?? null;
    const paidAccess = Boolean(entitlement) && isFutureDate(expiresDate);
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { error: updateError } = await adminClient
      .from('user_profiles')
      .update({
        plan: paidAccess ? 'paid' : 'free',
        subscription_provider: 'revenuecat',
        revenuecat_app_user_id: user.id,
        apple_original_transaction_id:
          subscription?.original_transaction_id ?? subscription?.store_transaction_id ?? null,
        revenuecat_product_id: productId,
        revenuecat_entitlement_status: paidAccess ? 'active' : 'inactive',
        subscription_status: paidAccess ? 'active' : 'inactive',
        subscription_current_period_end: expiresDate,
      })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ synced: true, plan: paidAccess ? 'paid' : 'free' }), {
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
