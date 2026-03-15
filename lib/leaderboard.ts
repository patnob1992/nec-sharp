/**
 * Leaderboard system — Performance Score and rankings.
 * Weekly cycle resets Sunday 00:00 UTC.
 * NOTE: user_stats has no weekly columns (week_key, ppi, etc.) until weekly_stats table exists.
 * Leaderboard fetches return empty until then. upsertPerformanceScore only updates lifetime fields.
 */

import { supabase } from "./supabase";
import { getLevelFromXp } from "./progression";
import type { RankName } from "./rankEngine";

export const RANK_LABELS = ["Novice", "Apprentice", "Journeyman", "Master", "Legend"] as const;
export type RankLabel = (typeof RANK_LABELS)[number];

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  email_hash?: string;
  performance_score: number;
  rank_label: string;
  weekly_sessions_completed: number;
};

export type LeaderboardResult = {
  top10: LeaderboardEntry[];
  userPosition: LeaderboardEntry | null;
  totalRanked: number;
};

/** Fetch global leaderboard: top 10 + current user position. Returns empty until weekly_stats exists. */
export async function fetchGlobalLeaderboard(_userId: string): Promise<LeaderboardResult> {
  return { top10: [], userPosition: null, totalRanked: 0 };
}

/** Fetch rank-tier leaderboard. Returns empty until weekly_stats exists. */
export async function fetchRankTierLeaderboard(
  _userId: string,
  _rankLabel: string
): Promise<LeaderboardResult> {
  return { top10: [], userPosition: null, totalRanked: 0 };
}

export type RankUpResult = {
  rankUp: boolean;
  newRankName: RankName | null;
};

/** Update user_stats with lifetime fields only (no weekly columns until weekly_stats exists) */
export async function upsertPerformanceScore(
  userId: string,
  params: {
    totalXp: number;
    totalAnswered: number;
    totalCorrect: number;
    sessionCorrect?: number;
    sessionAnswered?: number;
    sessionArticlesImproved?: number;
    streakLength?: number;
    rankLabel: RankName;
  }
): Promise<RankUpResult> {
  const { level } = getLevelFromXp(params.totalXp);
  const now = new Date().toISOString();
  const payload = {
    total_xp: params.totalXp,
    total_answered: params.totalAnswered,
    total_correct: params.totalCorrect,
    level,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("user_stats")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("user_stats").insert({ user_id: userId, ...payload });
  } else {
    await supabase.from("user_stats").update(payload).eq("user_id", userId);
  }

  return { rankUp: false, newRankName: null };
}
