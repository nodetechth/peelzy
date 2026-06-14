ALTER TABLE books
ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#E4C0FF';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_theme_check'
  ) THEN
    ALTER TABLE books
    ADD CONSTRAINT books_theme_check
    CHECK (theme IN ('classic', 'brutalist', 'film'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_accent_color_check'
  ) THEN
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
      '#CFF2BE'
    ));
  END IF;
END $$;
