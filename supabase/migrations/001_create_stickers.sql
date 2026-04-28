-- Create stickers table
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_stickers_user_id ON stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_stickers_created_at ON stickers(created_at DESC);

-- Enable RLS
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own stickers
CREATE POLICY "Users can view own stickers"
  ON stickers FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own stickers
CREATE POLICY "Users can insert own stickers"
  ON stickers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own stickers
CREATE POLICY "Users can delete own stickers"
  ON stickers FOR DELETE
  USING (auth.uid() = user_id);

-- Create stickers storage bucket (run this in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('stickers', 'stickers', true);

-- Storage policies for stickers bucket
-- CREATE POLICY "Users can upload stickers"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Anyone can view stickers"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'stickers');

-- CREATE POLICY "Users can delete own stickers"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
