ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'paid')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer_id
  ON user_profiles(stripe_customer_id);

CREATE TABLE IF NOT EXISTS sticker_creation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id UUID UNIQUE REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticker_creation_events_user_month
  ON sticker_creation_events(user_id, created_at DESC);

ALTER TABLE sticker_creation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sticker_creation_events'
      AND policyname = 'Users can view own sticker creation events'
  ) THEN
    CREATE POLICY "Users can view own sticker creation events"
      ON sticker_creation_events FOR SELECT
      TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;
END $$;

INSERT INTO sticker_creation_events (user_id, sticker_id, created_at)
SELECT stickers.user_id, stickers.id, COALESCE(stickers.created_at, now())
FROM stickers
ON CONFLICT (sticker_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_effective_plan(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(user_profiles.plan, 'free') = 'paid'
      OR user_profiles.subscription_status IN ('active', 'trialing')
    THEN 'paid'
    ELSE 'free'
  END
  FROM user_profiles
  WHERE user_profiles.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION get_sticker_month_period(p_now TIMESTAMP WITH TIME ZONE)
RETURNS TABLE(period_start TIMESTAMP WITH TIME ZONE, period_end TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', p_now)::TIMESTAMP WITH TIME ZONE AS period_start,
    (date_trunc('month', p_now) + interval '1 month')::TIMESTAMP WITH TIME ZONE AS period_end;
$$;

CREATE OR REPLACE FUNCTION get_account_status()
RETURNS TABLE(
  plan TEXT,
  sticker_limit INTEGER,
  stickers_used INTEGER,
  stickers_remaining INTEGER,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  subscription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  effective_plan TEXT;
  monthly_limit INTEGER;
  used_count INTEGER;
  start_at TIMESTAMP WITH TIME ZONE;
  end_at TIMESTAMP WITH TIME ZONE;
  profile_subscription_status TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_profiles (id, display_name)
  VALUES (current_user_id, 'Peelzy user ' || left(current_user_id::text, 4))
  ON CONFLICT (id) DO NOTHING;

  SELECT periods.period_start, periods.period_end
  INTO start_at, end_at
  FROM get_sticker_month_period(now()) periods;

  SELECT
    COALESCE(get_effective_plan(current_user_id), 'free'),
    user_profiles.subscription_status
  INTO effective_plan, profile_subscription_status
  FROM user_profiles
  WHERE id = current_user_id;

  monthly_limit := CASE WHEN effective_plan = 'paid' THEN 100 ELSE 5 END;

  SELECT COUNT(*)::INTEGER
  INTO used_count
  FROM sticker_creation_events
  WHERE user_id = current_user_id
    AND created_at >= start_at
    AND created_at < end_at;

  RETURN QUERY SELECT
    effective_plan,
    monthly_limit,
    used_count,
    GREATEST(monthly_limit - used_count, 0),
    start_at,
    end_at,
    profile_subscription_status;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_monthly_sticker_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_plan TEXT;
  monthly_limit INTEGER;
  used_count INTEGER;
  start_at TIMESTAMP WITH TIME ZONE;
  end_at TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Sticker owner is required';
  END IF;

  INSERT INTO user_profiles (id, display_name)
  VALUES (NEW.user_id, 'Peelzy user ' || left(NEW.user_id::text, 4))
  ON CONFLICT (id) DO NOTHING;

  SELECT periods.period_start, periods.period_end
  INTO start_at, end_at
  FROM get_sticker_month_period(now()) periods;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text || start_at::text));

  effective_plan := COALESCE(get_effective_plan(NEW.user_id), 'free');
  monthly_limit := CASE WHEN effective_plan = 'paid' THEN 100 ELSE 5 END;

  SELECT COUNT(*)::INTEGER
  INTO used_count
  FROM sticker_creation_events
  WHERE user_id = NEW.user_id
    AND created_at >= start_at
    AND created_at < end_at;

  IF used_count >= monthly_limit THEN
    RAISE EXCEPTION 'Monthly sticker limit reached'
      USING HINT = 'Upgrade to Peelzy Plus to create up to 100 stickers per month.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_sticker_creation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO sticker_creation_events (user_id, sticker_id, created_at)
  VALUES (NEW.user_id, NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (sticker_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_sticker_insert_enforce_monthly_limit ON stickers;
CREATE TRIGGER before_sticker_insert_enforce_monthly_limit
  BEFORE INSERT ON stickers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_monthly_sticker_limit();

DROP TRIGGER IF EXISTS after_sticker_insert_record_creation_event ON stickers;
CREATE TRIGGER after_sticker_insert_record_creation_event
  AFTER INSERT ON stickers
  FOR EACH ROW
  EXECUTE FUNCTION record_sticker_creation_event();

REVOKE ALL ON FUNCTION get_effective_plan(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_monthly_sticker_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION record_sticker_creation_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_account_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_account_status() TO authenticated;
