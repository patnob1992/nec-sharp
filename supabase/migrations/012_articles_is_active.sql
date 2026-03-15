-- Add is_active as alias for active (for API consistency)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
UPDATE public.articles SET is_active = active;
