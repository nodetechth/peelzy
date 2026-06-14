ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_product_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_entitlement_status TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_revenuecat_app_user_id
  ON user_profiles(revenuecat_app_user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_apple_original_transaction_id
  ON user_profiles(apple_original_transaction_id);

CREATE TABLE IF NOT EXISTS subscription_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE subscription_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_effective_plan(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(user_profiles.plan, 'free') = 'paid'
      OR user_profiles.subscription_status IN ('active', 'trialing')
      OR user_profiles.subscription_current_period_end > now()
    THEN 'paid'
    ELSE 'free'
  END
  FROM user_profiles
  WHERE user_profiles.id = p_user_id;
$$;

REVOKE ALL ON subscription_webhook_events FROM PUBLIC;
REVOKE ALL ON FUNCTION get_effective_plan(UUID) FROM PUBLIC;
