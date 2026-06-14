CREATE TABLE IF NOT EXISTS book_page_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL CHECK (page_index >= 0),
  type TEXT NOT NULL CHECK (type IN ('note', 'text', 'stamp')),
  content TEXT NOT NULL,
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
  color TEXT,
  style JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_page_elements_user_id
  ON book_page_elements(user_id);

CREATE INDEX IF NOT EXISTS idx_book_page_elements_book_page
  ON book_page_elements(book_id, page_index, created_at);

ALTER TABLE book_page_elements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_page_elements'
      AND policyname = 'Users can view own page elements'
  ) THEN
    CREATE POLICY "Users can view own page elements"
      ON book_page_elements FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_page_elements'
      AND policyname = 'Users can insert own page elements'
  ) THEN
    CREATE POLICY "Users can insert own page elements"
      ON book_page_elements FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM books
          WHERE books.id = book_page_elements.book_id
            AND books.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_page_elements'
      AND policyname = 'Users can update own page elements'
  ) THEN
    CREATE POLICY "Users can update own page elements"
      ON book_page_elements FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_page_elements'
      AND policyname = 'Users can delete own page elements'
  ) THEN
    CREATE POLICY "Users can delete own page elements"
      ON book_page_elements FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
