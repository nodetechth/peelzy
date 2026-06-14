CREATE OR REPLACE FUNCTION delete_exchange_offer(p_offer_id UUID)
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

  DELETE FROM sticker_exchange_offers
  WHERE id = p_offer_id
    AND owner_id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer is not available';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION delete_exchange_offer(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_exchange_offer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_exchange_offer(UUID) TO authenticated;
