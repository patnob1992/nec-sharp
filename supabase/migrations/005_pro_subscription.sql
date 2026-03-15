-- Pro subscription flags (structural prep for Core vs Pro split)
-- Core: Daily 5, Rank, Level, Article mastery, Streak, Basic dashboard
-- Pro: Global leaderboard, Rank-tier leaderboard, Crew, Weekly performance summary, Seasonal reset

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN profiles.is_pro IS 'Pro subscription active. Default true until paywalls added.';
COMMENT ON COLUMN profiles.pro_expires_at IS 'When Pro subscription expires. Null = lifetime or not applicable.';
