/**
 * Core vs Pro feature architecture.
 *
 * CORE (one-time purchase):
 * - Daily 5 sessions
 * - Rank system (computed from article mastery, no leaderboard dependency)
 * - Level system (XP-based)
 * - Article mastery tracking
 * - Streak
 * - Basic dashboard stats (rank, level, streak, today's mission, your standing)
 *
 * PRO (subscription):
 * - Global leaderboard
 * - Rank-tier leaderboard
 * - Crew system
 * - Weekly performance summary (enhanced analytics)
 * - Seasonal reset ranking
 *
 * No paywalls yet. Structural preparation only.
 * is_pro defaults to true until paywalls are added.
 */

export type UserProStatus = {
  isPro: boolean;
  proExpiresAt: string | null;
};

/** Check if user has Pro access. Until paywalls: default true when unknown. */
export function hasProAccess(status: UserProStatus | null | undefined): boolean {
  if (!status) return true; // No restriction yet
  if (!status.isPro) return false;
  if (status.proExpiresAt) {
    try {
      const expires = new Date(status.proExpiresAt).getTime();
      if (expires < Date.now()) return false;
    } catch {
      return true;
    }
  }
  return true;
}

/** Pro feature flags — for conditional rendering. Not enforced at API level yet. */
export const PRO_FEATURES = {
  GLOBAL_LEADERBOARD: "global_leaderboard",
  RANK_TIER_LEADERBOARD: "rank_tier_leaderboard",
  CREW_SYSTEM: "crew_system",
  WEEKLY_PERFORMANCE_SUMMARY: "weekly_performance_summary",
  SEASONAL_RESET_RANKING: "seasonal_reset_ranking",
} as const;
