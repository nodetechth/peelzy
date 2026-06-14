CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'Signed-in users can view profiles'
  ) THEN
    CREATE POLICY "Signed-in users can view profiles"
      ON user_profiles FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON user_profiles FOR UPDATE
      TO authenticated
      USING ((select auth.uid()) = id)
      WITH CHECK ((select auth.uid()) = id);
  END IF;
END $$;

INSERT INTO user_profiles (id, display_name, created_at, updated_at)
SELECT
  users.id,
  COALESCE(
    NULLIF(users.raw_user_meta_data->>'full_name', ''),
    NULLIF(users.raw_user_meta_data->>'name', ''),
    'Peelzy user ' || left(users.id::text, 4)
  ),
  COALESCE(users.created_at, now()),
  now()
FROM auth.users users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      'Peelzy user ' || left(NEW.id::text, 4)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_create_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile_on_signup();

CREATE TABLE IF NOT EXISTS sticker_owner_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  released_at TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL DEFAULT 'created' CHECK (source IN ('created', 'exchange', 'import')),
  transfer_proposal_id UUID REFERENCES sticker_exchange_proposals(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticker_owner_history_sticker_id
  ON sticker_owner_history(sticker_id, acquired_at ASC);

CREATE INDEX IF NOT EXISTS idx_sticker_owner_history_owner_id
  ON sticker_owner_history(owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sticker_owner_history_one_current_owner
  ON sticker_owner_history(sticker_id)
  WHERE released_at IS NULL;

ALTER TABLE sticker_owner_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_view_sticker_owner_history(
  p_sticker_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM stickers
      WHERE stickers.id = p_sticker_id
        AND stickers.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM sticker_owner_history history
      WHERE history.sticker_id = p_sticker_id
        AND history.owner_id = p_user_id
    );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sticker_owner_history'
      AND policyname = 'Relevant users can view sticker owner history'
  ) THEN
    CREATE POLICY "Relevant users can view sticker owner history"
      ON sticker_owner_history FOR SELECT
      TO authenticated
      USING (can_view_sticker_owner_history(sticker_id, (select auth.uid())));
  END IF;
END $$;

INSERT INTO sticker_owner_history (sticker_id, owner_id, acquired_at, source)
SELECT stickers.id, stickers.user_id, COALESCE(stickers.created_at, now()), 'created'
FROM stickers
WHERE NOT EXISTS (
  SELECT 1
  FROM sticker_owner_history
  WHERE sticker_owner_history.sticker_id = stickers.id
);

CREATE OR REPLACE FUNCTION record_initial_sticker_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (NEW.user_id, 'Peelzy user ' || left(NEW.user_id::text, 4))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO sticker_owner_history (sticker_id, owner_id, acquired_at, source)
  VALUES (NEW.id, NEW.user_id, COALESCE(NEW.created_at, now()), 'created')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_sticker_created_record_owner ON stickers;
CREATE TRIGGER on_sticker_created_record_owner
  AFTER INSERT ON stickers
  FOR EACH ROW
  EXECUTE FUNCTION record_initial_sticker_owner();

CREATE OR REPLACE FUNCTION record_sticker_exchange_ownership(
  p_sticker_id UUID,
  p_from_owner UUID,
  p_to_owner UUID,
  p_proposal_id UUID,
  p_transfer_time TIMESTAMP WITH TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES
    (p_from_owner, 'Peelzy user ' || left(p_from_owner::text, 4)),
    (p_to_owner, 'Peelzy user ' || left(p_to_owner::text, 4))
  ON CONFLICT (id) DO NOTHING;

  UPDATE sticker_owner_history
  SET released_at = p_transfer_time
  WHERE sticker_id = p_sticker_id
    AND owner_id = p_from_owner
    AND released_at IS NULL;

  INSERT INTO sticker_owner_history (
    sticker_id,
    owner_id,
    acquired_at,
    source,
    transfer_proposal_id
  )
  VALUES (
    p_sticker_id,
    p_to_owner,
    p_transfer_time,
    'exchange',
    p_proposal_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION accept_exchange_proposal(proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_proposal sticker_exchange_proposals%ROWTYPE;
  target_offer sticker_exchange_offers%ROWTYPE;
  transfer_time TIMESTAMP WITH TIME ZONE := now();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO target_proposal
  FROM sticker_exchange_proposals
  WHERE id = proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  SELECT *
  INTO target_offer
  FROM sticker_exchange_offers
  WHERE id = target_proposal.offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF target_offer.owner_id <> current_user_id AND NOT target_offer.auto_accept THEN
    RAISE EXCEPTION 'Only the offer owner can accept this proposal';
  END IF;

  IF target_offer.status <> 'active' OR target_offer.expires_at <= now() THEN
    UPDATE sticker_exchange_offers
    SET status = 'expired'
    WHERE id = target_offer.id AND status = 'active' AND expires_at <= now();
    RAISE EXCEPTION 'Offer is no longer active';
  END IF;

  IF target_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal is no longer pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stickers
    WHERE id = target_offer.sticker_id
      AND user_id = target_offer.owner_id
  ) THEN
    RAISE EXCEPTION 'Offered sticker is no longer available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stickers
    WHERE id = target_proposal.offered_sticker_id
      AND user_id = target_proposal.proposer_id
  ) THEN
    RAISE EXCEPTION 'Proposed sticker is no longer available';
  END IF;

  PERFORM record_sticker_exchange_ownership(
    target_offer.sticker_id,
    target_offer.owner_id,
    target_proposal.proposer_id,
    target_proposal.id,
    transfer_time
  );

  PERFORM record_sticker_exchange_ownership(
    target_proposal.offered_sticker_id,
    target_proposal.proposer_id,
    target_offer.owner_id,
    target_proposal.id,
    transfer_time
  );

  UPDATE stickers
  SET
    user_id = target_proposal.proposer_id,
    book_id = NULL,
    page_index = NULL,
    pos_x = NULL,
    pos_y = NULL,
    rotation = 0
  WHERE id = target_offer.sticker_id;

  UPDATE stickers
  SET
    user_id = target_offer.owner_id,
    book_id = NULL,
    page_index = NULL,
    pos_x = NULL,
    pos_y = NULL,
    rotation = 0
  WHERE id = target_proposal.offered_sticker_id;

  UPDATE sticker_exchange_proposals
  SET status = 'accepted'
  WHERE id = target_proposal.id;

  UPDATE sticker_exchange_proposals
  SET status = 'rejected'
  WHERE offer_id = target_offer.id
    AND id <> target_proposal.id
    AND status = 'pending';

  UPDATE sticker_exchange_offers
  SET status = 'accepted',
      accepted_proposal_id = target_proposal.id
  WHERE id = target_offer.id;

  UPDATE sticker_exchange_offers
  SET status = 'canceled'
  WHERE status = 'active'
    AND id <> target_offer.id
    AND (
      sticker_id = target_offer.sticker_id
      OR sticker_id = target_proposal.offered_sticker_id
    );
END;
$$;

REVOKE ALL ON FUNCTION record_initial_sticker_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION record_sticker_exchange_ownership(UUID, UUID, UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_user_profile_on_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_exchange_proposal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_view_sticker_owner_history(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_exchange_proposal(UUID) TO authenticated;
