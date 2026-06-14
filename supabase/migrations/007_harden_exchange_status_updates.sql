DROP POLICY IF EXISTS "Users can cancel own exchange offers" ON sticker_exchange_offers;
DROP POLICY IF EXISTS "Users can update relevant exchange proposals" ON sticker_exchange_proposals;

CREATE OR REPLACE FUNCTION reject_exchange_proposal(p_proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE sticker_exchange_proposals
  SET status = 'rejected'
  WHERE id = p_proposal_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM sticker_exchange_offers
      WHERE sticker_exchange_offers.id = sticker_exchange_proposals.offer_id
        AND sticker_exchange_offers.owner_id = current_user_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal is not available';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_exchange_offer(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE sticker_exchange_offers
  SET status = 'canceled'
  WHERE id = p_offer_id
    AND owner_id = current_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer is not available';
  END IF;

  UPDATE sticker_exchange_proposals
  SET status = 'rejected'
  WHERE offer_id = p_offer_id
    AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION reject_exchange_proposal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_exchange_offer(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reject_exchange_proposal(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION cancel_exchange_offer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION reject_exchange_proposal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_exchange_offer(UUID) TO authenticated;
