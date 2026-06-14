CREATE TABLE IF NOT EXISTS sticker_exchange_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'expired', 'canceled')),
  auto_accept BOOLEAN NOT NULL DEFAULT false,
  accepted_proposal_id UUID,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sticker_exchange_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES sticker_exchange_offers(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE sticker_exchange_offers
  ADD CONSTRAINT sticker_exchange_offers_accepted_proposal_fk
  FOREIGN KEY (accepted_proposal_id) REFERENCES sticker_exchange_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exchange_offers_owner_id ON sticker_exchange_offers(owner_id);
CREATE INDEX IF NOT EXISTS idx_exchange_offers_token ON sticker_exchange_offers(token);
CREATE INDEX IF NOT EXISTS idx_exchange_offers_sticker_id ON sticker_exchange_offers(sticker_id);
CREATE INDEX IF NOT EXISTS idx_exchange_offers_status_expires ON sticker_exchange_offers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_exchange_proposals_offer_id ON sticker_exchange_proposals(offer_id);
CREATE INDEX IF NOT EXISTS idx_exchange_proposals_proposer_id ON sticker_exchange_proposals(proposer_id);
CREATE INDEX IF NOT EXISTS idx_exchange_proposals_offered_sticker_id ON sticker_exchange_proposals(offered_sticker_id);

ALTER TABLE sticker_exchange_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_exchange_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create exchange offers" ON sticker_exchange_offers;
DROP POLICY IF EXISTS "Users can view relevant exchange offers" ON sticker_exchange_offers;
DROP POLICY IF EXISTS "Users can cancel own exchange offers" ON sticker_exchange_offers;
DROP POLICY IF EXISTS "Users can create exchange proposals" ON sticker_exchange_proposals;
DROP POLICY IF EXISTS "Users can view relevant exchange proposals" ON sticker_exchange_proposals;
DROP POLICY IF EXISTS "Users can update relevant exchange proposals" ON sticker_exchange_proposals;
DROP POLICY IF EXISTS "Users can view exchange stickers" ON stickers;

CREATE POLICY "Users can create exchange offers"
  ON sticker_exchange_offers FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1 FROM stickers
      WHERE stickers.id = sticker_id
        AND stickers.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can view relevant exchange offers"
  ON sticker_exchange_offers FOR SELECT
  TO authenticated
  USING (
    owner_id = (select auth.uid())
    OR (
      status = 'active'
      AND expires_at > now()
    )
  );

CREATE POLICY "Users can cancel own exchange offers"
  ON sticker_exchange_offers FOR UPDATE
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "Users can create exchange proposals"
  ON sticker_exchange_proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    proposer_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM stickers
      WHERE stickers.id = offered_sticker_id
        AND stickers.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.id = offer_id
        AND sticker_exchange_offers.owner_id <> (select auth.uid())
        AND sticker_exchange_offers.status = 'active'
        AND sticker_exchange_offers.expires_at > now()
    )
  );

CREATE POLICY "Users can view relevant exchange proposals"
  ON sticker_exchange_proposals FOR SELECT
  TO authenticated
  USING (
    proposer_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.id = offer_id
        AND sticker_exchange_offers.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update relevant exchange proposals"
  ON sticker_exchange_proposals FOR UPDATE
  TO authenticated
  USING (
    proposer_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.id = offer_id
        AND sticker_exchange_offers.owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    proposer_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.id = offer_id
        AND sticker_exchange_offers.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can view exchange stickers"
  ON stickers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.sticker_id = stickers.id
        AND sticker_exchange_offers.status = 'active'
        AND sticker_exchange_offers.expires_at > now()
    )
    OR EXISTS (
      SELECT 1
      FROM sticker_exchange_proposals
      JOIN sticker_exchange_offers ON sticker_exchange_offers.id = sticker_exchange_proposals.offer_id
      WHERE sticker_exchange_proposals.offered_sticker_id = stickers.id
        AND (
          sticker_exchange_proposals.proposer_id = (select auth.uid())
          OR sticker_exchange_offers.owner_id = (select auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION create_exchange_proposal_by_token(
  offer_token TEXT,
  proposer_sticker_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_offer sticker_exchange_offers%ROWTYPE;
  new_proposal_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO target_offer
  FROM sticker_exchange_offers
  WHERE token = offer_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF target_offer.owner_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot propose your own sticker';
  END IF;

  IF target_offer.status <> 'active' OR target_offer.expires_at <= now() THEN
    UPDATE sticker_exchange_offers
    SET status = 'expired'
    WHERE id = target_offer.id AND status = 'active' AND expires_at <= now();
    RAISE EXCEPTION 'Offer is no longer active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stickers
    WHERE id = proposer_sticker_id
      AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Sticker is not available';
  END IF;

  INSERT INTO sticker_exchange_proposals (
    offer_id,
    proposer_id,
    offered_sticker_id
  )
  VALUES (
    target_offer.id,
    current_user_id,
    proposer_sticker_id
  )
  RETURNING id INTO new_proposal_id;

  IF target_offer.auto_accept THEN
    PERFORM accept_exchange_proposal(new_proposal_id);
  END IF;

  RETURN new_proposal_id;
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
