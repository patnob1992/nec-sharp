/**
 * Rank + Article Coverage — single source of truth.
 * Rank is derived from coverage + per-article mastery. NOT stored in DB.
 */

export const RANKS = [
  { name: "Novice", coverage: 0, perArticle: 0 },
  { name: "Apprentice", coverage: 10, perArticle: 50 },
  { name: "Journeyman", coverage: 25, perArticle: 70 },
  { name: "Master", coverage: 60, perArticle: 85 },
  { name: "Legend", coverage: 90, perArticle: 95 },
] as const;

export type RankName = (typeof RANKS)[number]["name"];

export type MasteryRow = { article?: string; mastery_pct?: number | null };

export type ActiveArticle = { article: string };

/**
 * Compute rank state from active articles and mastery rows.
 * - totalArticles = activeArticles.length
 * - qualifiedArticles = count where mastery_pct >= perArticle threshold
 * - coveragePct = (qualifiedArticles / totalArticles) * 100
 * - Current rank = highest rank where coveragePct >= rank.coverage
 * - Missing mastery row → mastery_pct = 0
 */
export function computeRankState(
  activeArticles: ActiveArticle[],
  masteryRows: MasteryRow[]
): {
  currentRank: RankName;
  nextRank: RankName | null;
  coveragePct: number;
  qualifiedArticles: number;
  totalArticles: number;
  progressToNext: number;
  ranksBreakdown: RankBreakdownRow[];
  qualifiedForNextRank: number;
  requiredForNextRank: number;
  perArticleThresholdForNextRank: number;
  coveragePctForNextRank: number;
} {
  const totalArticles = activeArticles.length;

  function countQualified(perArticleThreshold: number): number {
    return activeArticles.filter((a) => {
      const row = masteryRows.find((m) => m.article === a.article);
      const mastery = row?.mastery_pct ?? 0;
      return mastery >= perArticleThreshold;
    }).length;
  }

  let currentRank: (typeof RANKS)[number] = RANKS[0];
  let nextRank: (typeof RANKS)[number] | null = null;

  for (let i = 0; i < RANKS.length; i++) {
    const rank = RANKS[i];
    const qualified = countQualified(rank.perArticle);
    const coveragePct = totalArticles === 0 ? 0 : (qualified / totalArticles) * 100;

    if (coveragePct >= rank.coverage) {
      currentRank = rank;
      nextRank = RANKS[i + 1] ?? null;
    }
  }

  const qualifiedCurrent = countQualified(currentRank.perArticle);
  const coveragePct = totalArticles === 0 ? 0 : (qualifiedCurrent / totalArticles) * 100;

  // Extra fields for Dashboard + Code Coverage modal
  let qualifiedForNextRank = 0;
  let requiredForNextRank = 0;
  let progressToNext = 1;
  if (nextRank) {
    qualifiedForNextRank = countQualified(nextRank.perArticle);
    requiredForNextRank = Math.ceil((nextRank.coverage / 100) * totalArticles);
    progressToNext =
      requiredForNextRank > 0 ? Math.max(0, Math.min(1, qualifiedForNextRank / requiredForNextRank)) : 1;
  }

  const ranksBreakdown: RankBreakdownRow[] = RANKS.map((tier) => {
    const qualified = countQualified(tier.perArticle);
    const required = Math.ceil((tier.coverage / 100) * totalArticles);
    const achieved = qualified >= required;
    return {
      rankName: tier.name,
      qualifiedArticles: qualified,
      requiredArticles: required,
      coveragePct: tier.coverage,
      perArticleThreshold: tier.perArticle,
      status: achieved ? "On Track" : "Not Yet",
    };
  });

  return {
    currentRank: currentRank.name,
    nextRank: nextRank?.name ?? null,
    coveragePct,
    qualifiedArticles: qualifiedCurrent,
    totalArticles,
    progressToNext,
    ranksBreakdown,
    qualifiedForNextRank,
    requiredForNextRank,
    perArticleThresholdForNextRank: nextRank?.perArticle ?? 0,
    coveragePctForNextRank: nextRank?.coverage ?? 0,
  };
}

export type RankBreakdownRow = {
  rankName: string;
  qualifiedArticles: number;
  requiredArticles: number;
  coveragePct: number;
  perArticleThreshold: number;
  status: "On Track" | "Not Yet";
};
