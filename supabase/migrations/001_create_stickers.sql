-- Create sticker books
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_color TEXT NOT NULL DEFAULT '#A78BFA',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stickers table
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  page_index INTEGER,
  pos_x DOUBLE PRECISION,
  pos_y DOUBLE PRECISION,
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Keep older databases aligned with the current app model
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS page_index INTEGER;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS rotation DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES books(id) ON DELETE SET NULL;

-- Add indexes for common app queries
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_stickers_user_id ON stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_stickers_created_at ON stickers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stickers_book_id ON stickers(book_id);
CREATE INDEX IF NOT EXISTS idx_stickers_book_page ON stickers(book_id, page_index);

-- Enable RLS
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'books' AND policyname = 'Users can view own books'
  ) THEN
    CREATE POLICY "Users can view own books"
      ON books FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'books' AND policyname = 'Users can insert own books'
  ) THEN
    CREATE POLICY "Users can insert own books"
      ON books FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'books' AND policyname = 'Users can update own books'
  ) THEN
    CREATE POLICY "Users can update own books"
      ON books FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'books' AND policyname = 'Users can delete own books'
  ) THEN
    CREATE POLICY "Users can delete own books"
      ON books FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stickers' AND policyname = 'Users can view own stickers'
  ) THEN
    CREATE POLICY "Users can view own stickers"
      ON stickers FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stickers' AND policyname = 'Users can insert own stickers'
  ) THEN
    CREATE POLICY "Users can insert own stickers"
      ON stickers FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stickers' AND policyname = 'Users can update own stickers'
  ) THEN
    CREATE POLICY "Users can update own stickers"
      ON stickers FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stickers' AND policyname = 'Users can delete own stickers'
  ) THEN
    CREATE POLICY "Users can delete own stickers"
      ON stickers FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Storage buckets used by uploadPhoto() and uploadSticker()
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('photos', 'photos', true),
  ('stickers', 'stickers', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload own photos'
  ) THEN
    CREATE POLICY "Users can upload own photos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view photos'
  ) THEN
    CREATE POLICY "Anyone can view photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete own photos'
  ) THEN
    CREATE POLICY "Users can delete own photos"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload own stickers'
  ) THEN
    CREATE POLICY "Users can upload own stickers"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view stickers'
  ) THEN
    CREATE POLICY "Anyone can view stickers"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'stickers');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete own stickers'
  ) THEN
    CREATE POLICY "Users can delete own stickers"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
