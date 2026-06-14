ALTER TABLE books
ADD COLUMN IF NOT EXISTS page_color TEXT NOT NULL DEFAULT '#E4C0FF';

UPDATE books
SET page_color = COALESCE(page_color, accent_color, '#E4C0FF');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_page_color_check'
  ) THEN
    ALTER TABLE books
    ADD CONSTRAINT books_page_color_check
    CHECK (page_color IN (
      '#E4C0FF',
      '#FFE566',
      '#FF6B6B',
      '#7DF9AA',
      '#87CEEB',
      '#FFB347',
      '#FFC7D6',
      '#CFF2BE',
      '#A77C8A',
      '#6F7F72'
    ));
  END IF;
END $$;

ALTER TABLE books
DROP CONSTRAINT IF EXISTS books_accent_color_check;

ALTER TABLE books
ADD CONSTRAINT books_accent_color_check
CHECK (accent_color IN (
  '#E4C0FF',
  '#FFE566',
  '#FF6B6B',
  '#7DF9AA',
  '#87CEEB',
  '#FFB347',
  '#FFC7D6',
  '#CFF2BE',
  '#A77C8A',
  '#6F7F72'
));
