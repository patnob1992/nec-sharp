/**
 * Rank Engine — Division logic + getRank for localStorage-based flows.
 * Canonical ranks: Novice, Apprentice, Journeyman, Master, Legend.
 * Legacy names (Specialist, Foreman, Master Electrician) map to Novice.
 */

import type { RankName } from "./rank";

export type UserArticleStat = {
  correctCount: number;
  totalAttempts: number;
};

export type UserArticleStats = Record<string, UserArticleStat>;

/** 5 ranks only. coverage/articleThreshold in 0-1 scale for getRank. */
export const RANK_TIERS = [
  { name: "Novice" as const, coverage: 0, articleThreshold: 0 },
  { name: "Apprentice" as const, coverage: 0.1, articleThreshold: 0.5 },
  { name: "Journeyman" as const, coverage: 0.25, articleThreshold: 0.7 },
  { name: "Master" as const, coverage: 0.6, articleThreshold: 0.85 },
  { name: "Legend" as const, coverage: 0.9, articleThreshold: 0.95 },
] as const;

export type { RankName };

const CANONICAL_NAMES = ["Novice", "Apprentice", "Journeyman", "Master", "Legend"] as const;

/** Map to canonical rank. Legacy names (Specialist, Foreman, Master Electrician) → Novice. */
export function getDisplayRank(name: string): RankName {
  if (CANONICAL_NAMES.includes(name as RankName)) return name as RankName;
  return "Novice";
}

/** Get tier index (0–4) for comparison. */
export function getTierIndex(name: string): number {
  const canonical = getDisplayRank(name);
  const i = RANK_TIERS.findIndex((t) => t.name === canonical);
  return i >= 0 ? i : 0;
}

/** Division from progressToNextRank (0–1). UI only. Resets to III on rankUp. */
export function getDivisionFromProgress(progress: number): "Division III" | "Division II" | "Division I" {
  if (progress >= 0.67) return "Division I";
  if (progress >= 0.34) return "Division II";
  return "Division III";
}

export type RankResult = {
  rankName: RankName;
  rankIndex: number;
  coveragePercent: number;
  qualifiedArticlesCount: number;
  nextRankName: RankName | null;
  progressToNextRank: number;
};

/**
 * Compute rank from user article stats and article keys.
 * Deterministic. Uses coverage + per-article mastery threshold.
 */
export function getRank(
  userArticleStats: UserArticleStats,
  articleKeys: string[]
): RankResult {
  const totalArticles = articleKeys.length;
  if (totalArticles === 0) {
    return {
      rankName: "Novice",
      rankIndex: 0,
      coveragePercent: 0,
      qualifiedArticlesCount: 0,
      nextRankName: "Apprentice",
      progressToNextRank: 0,
    };
  }

  let bestIdx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    const tier = RANK_TIERS[i];
    let qualified = 0;
    for (const key of articleKeys) {
      const stat = userArticleStats[key];
      const pct = stat && stat.totalAttempts > 0 ? stat.correctCount / stat.totalAttempts : 0;
      if (pct >= tier.articleThreshold) qualified++;
    }
    const coverage = qualified / totalArticles;
    if (coverage >= tier.coverage) bestIdx = i;
  }

  const current = RANK_TIERS[bestIdx];
  const next = bestIdx < RANK_TIERS.length - 1 ? RANK_TIERS[bestIdx + 1] : null;

  let qualifiedCount = 0;
  for (const key of articleKeys) {
    const stat = userArticleStats[key];
    const pct = stat && stat.totalAttempts > 0 ? stat.correctCount / stat.totalAttempts : 0;
    if (pct >= current.articleThreshold) qualifiedCount++;
  }
  const coveragePercent = qualifiedCount / totalArticles;

  let progressToNextRank = 1;
  if (next) {
    const bandMin = current.coverage;
    const bandMax = next.coverage;
    progressToNextRank = Math.max(0, Math.min(1, (coveragePercent - bandMin) / (bandMax - bandMin)));
  }

  return {
    rankName: current.name,
    rankIndex: bestIdx,
    coveragePercent,
    qualifiedArticlesCount: qualifiedCount,
    nextRankName: next?.name ?? null,
    progressToNextRank,
  };
}

/** Convert ArticleMastery to UserArticleStats for rankEngine */
export function masteryToUserArticleStats(
  mastery: Record<string, { correctCount: number; totalAttempts: number }>
): UserArticleStats {
  return { ...mastery };
}
