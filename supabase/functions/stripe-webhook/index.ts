import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function getPlanForStatus(status: string | null | undefined) {
  return status === 'active' || status === 'trialing' ? 'paid' : 'free';
}

async function updateSubscription(subscription: Stripe.Subscription) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const updatePayload = {
    plan: getPlanForStatus(subscription.status),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  const { count } = await adminClient
    .from('user_profiles')
    .update(updatePayload, { count: 'exact' })
    .eq('stripe_customer_id', customerId);

  const userId = subscription.metadata?.supabase_user_id;
  if (count === 0 && userId) {
    await adminClient
      .from('user_profiles')
      .upsert({
        id: userId,
        display_name: `Peelzy user ${userId.slice(0, 4)}`,
        ...updatePayload,
      }, { onConflict: 'id' });
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return new Response('Missing Stripe webhook configuration', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Invalid signature', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

      if (userId && customerId) {
        let subscriptionStatus: string | null = null;
        let currentPeriodEnd: string | null = null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = subscription.status;
          currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;
        }

        await adminClient
          .from('user_profiles')
          .upsert({
            id: userId,
            display_name: `Peelzy user ${userId.slice(0, 4)}`,
            plan: getPlanForStatus(subscriptionStatus ?? 'active'),
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: subscriptionStatus ?? 'active',
            subscription_current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateSubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
