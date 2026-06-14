WITH ranked_active_offers AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY sticker_id ORDER BY created_at DESC, id DESC) AS rank
  FROM sticker_exchange_offers
  WHERE status = 'active'
)
UPDATE sticker_exchange_offers
SET status = 'canceled'
WHERE id IN (
  SELECT id
  FROM ranked_active_offers
  WHERE rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_offers_one_active_per_sticker
  ON sticker_exchange_offers(sticker_id)
  WHERE status = 'active';
