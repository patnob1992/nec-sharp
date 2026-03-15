-- Guild tier rank names (presentation only, thresholds unchanged)
-- Unambiguous renames: Novice->Apprentice, Master->Foreman, Legend->Master Electrician
-- Apprentice/Journeyman overlap with old names; handled by app getDisplayRank

ALTER TABLE user_stats ALTER COLUMN current_rank SET DEFAULT 'Apprentice';
ALTER TABLE user_stats ALTER COLUMN highest_rank_achieved SET DEFAULT 'Apprentice';

UPDATE user_stats SET current_rank = 'Apprentice' WHERE current_rank = 'Novice';
UPDATE user_stats SET highest_rank_achieved = 'Apprentice' WHERE highest_rank_achieved = 'Novice';

UPDATE user_stats SET current_rank = 'Foreman' WHERE current_rank = 'Master';
UPDATE user_stats SET highest_rank_achieved = 'Foreman' WHERE highest_rank_achieved = 'Master';

UPDATE user_stats SET current_rank = 'Master Electrician' WHERE current_rank = 'Legend';
UPDATE user_stats SET highest_rank_achieved = 'Master Electrician' WHERE highest_rank_achieved = 'Legend';
