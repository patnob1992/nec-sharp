# NEC Sharp — Supabase Migrations

Run these migrations in the Supabase SQL Editor (Dashboard → SQL Editor) in order.

## 1. Leaderboard Performance Score

**File:** `migrations/001_leaderboard_performance_score.sql`

Adds weekly performance tracking to `user_stats`:
- `week_key`, `weekly_sessions_completed`, `weekly_correct`, `weekly_answered`, `weekly_articles_improved`
- `performance_score` — derived metric: `(weeklyAccuracy × 40) + (streakLength × 3) + (articlesImprovedThisWeek × 10)`
- `rank_label` — for rank-tier leaderboard filtering

**Note:** If `user_stats` does not have a primary key on `user_id`, ensure it has a unique constraint for upsert behavior.

## 2. Crew System

**File:** `migrations/002_crew_system.sql`

Creates `crew` and `crew_members` tables:
- Crew: name, invite_code, created_by, max_members (10–20)
- Crew members: crew_id, user_id
- RLS policies for authenticated access
