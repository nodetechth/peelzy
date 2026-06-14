-- Remove legacy broad/duplicate policies before recreating scoped policies.
DROP POLICY IF EXISTS "Users can manage their own books" ON books;

DROP POLICY IF EXISTS "Users can view own books" ON books;
DROP POLICY IF EXISTS "Users can insert own books" ON books;
DROP POLICY IF EXISTS "Users can update own books" ON books;
DROP POLICY IF EXISTS "Users can delete own books" ON books;

DROP POLICY IF EXISTS "Users can view own stickers" ON stickers;
DROP POLICY IF EXISTS "Users can insert own stickers" ON stickers;
DROP POLICY IF EXISTS "Users can update own stickers" ON stickers;
DROP POLICY IF EXISTS "Users can delete own stickers" ON stickers;

CREATE POLICY "Users can view own books"
  ON books FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own books"
  ON books FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own books"
  ON books FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can view own stickers"
  ON stickers FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own stickers"
  ON stickers FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own stickers"
  ON stickers FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own stickers"
  ON stickers FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Public buckets can serve object URLs without broad SELECT policies that allow listing.
DROP POLICY IF EXISTS "Anyone can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to stickers" ON storage.objects;

DROP POLICY IF EXISTS "Users can read own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own stickers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own stickers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own stickers" ON storage.objects;

CREATE POLICY "Users can read own photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can read own stickers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'stickers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can upload own stickers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'stickers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can delete own stickers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'stickers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
