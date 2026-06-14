REVOKE ALL ON FUNCTION create_exchange_proposal_by_token(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_exchange_proposal(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_exchange_proposal_by_token(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_exchange_proposal(UUID) TO authenticated;
