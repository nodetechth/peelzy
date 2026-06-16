ALTER TABLE stickers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE stickers
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stickers_user_updated_at
ON stickers(user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_stickers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_stickers_updated_at ON stickers;
CREATE TRIGGER set_stickers_updated_at
BEFORE UPDATE ON stickers
FOR EACH ROW
EXECUTE FUNCTION public.set_stickers_updated_at();

CREATE TABLE IF NOT EXISTS sticker_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticker_deletions_user_deleted_at
ON sticker_deletions(user_id, deleted_at DESC);

ALTER TABLE sticker_deletions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sticker_deletions' AND policyname = 'Users can view own sticker deletions'
  ) THEN
    CREATE POLICY "Users can view own sticker deletions"
      ON sticker_deletions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sticker_deletions' AND policyname = 'Users can insert own sticker deletions'
  ) THEN
    CREATE POLICY "Users can insert own sticker deletions"
      ON sticker_deletions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT ON sticker_deletions TO authenticated;

CREATE OR REPLACE FUNCTION public.log_sticker_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.sticker_deletions (sticker_id, user_id, deleted_at)
  VALUES (OLD.id, OLD.user_id, NOW());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS log_sticker_deletion ON stickers;
CREATE TRIGGER log_sticker_deletion
AFTER DELETE ON stickers
FOR EACH ROW
EXECUTE FUNCTION public.log_sticker_deletion();
