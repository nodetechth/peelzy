CREATE OR REPLACE FUNCTION owns_sticker(p_sticker_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM stickers
    WHERE id = p_sticker_id
      AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION can_propose_to_exchange_offer(p_offer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sticker_exchange_offers
    WHERE id = p_offer_id
      AND owner_id <> p_user_id
      AND status = 'active'
      AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION can_view_exchange_sticker(p_sticker_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sticker_exchange_offers
    WHERE sticker_id = p_sticker_id
      AND status = 'active'
      AND expires_at > now()
  )
  OR EXISTS (
    SELECT 1
    FROM sticker_exchange_proposals
    JOIN sticker_exchange_offers ON sticker_exchange_offers.id = sticker_exchange_proposals.offer_id
    WHERE sticker_exchange_proposals.offered_sticker_id = p_sticker_id
      AND (
        sticker_exchange_proposals.proposer_id = p_user_id
        OR sticker_exchange_offers.owner_id = p_user_id
      )
  );
$$;

DROP POLICY IF EXISTS "Users can create exchange offers" ON sticker_exchange_offers;
DROP POLICY IF EXISTS "Users can create exchange proposals" ON sticker_exchange_proposals;
DROP POLICY IF EXISTS "Users can view exchange stickers" ON stickers;

CREATE POLICY "Users can create exchange offers"
  ON sticker_exchange_offers FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = owner_id
    AND owns_sticker(sticker_id, (select auth.uid()))
  );

CREATE POLICY "Users can create exchange proposals"
  ON sticker_exchange_proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    proposer_id = (select auth.uid())
    AND owns_sticker(offered_sticker_id, (select auth.uid()))
    AND can_propose_to_exchange_offer(offer_id, (select auth.uid()))
  );

CREATE POLICY "Users can view exchange stickers"
  ON stickers FOR SELECT
  TO authenticated
  USING (can_view_exchange_sticker(id, (select auth.uid())));

REVOKE ALL ON FUNCTION owns_sticker(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_propose_to_exchange_offer(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_view_exchange_sticker(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION owns_sticker(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_propose_to_exchange_offer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_exchange_sticker(UUID, UUID) TO authenticated;
