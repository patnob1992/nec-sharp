/**
 * Rank summary from article_mastery + public.articles.
 * Uses lib/rank.ts as single source of truth.
 */

import { supabase } from "./supabase";
import { getArticleKey } from "./progression";
import { fetchActiveArticleKeys } from "./articles";
import { computeRankState, type RankName, type RankBreakdownRow } from "./rank";

export { RANKS as RANK_DEFINITIONS, type RankName, type RankBreakdownRow } from "./rank";

export type RankSummary = {
  currentRankName: RankName;
  nextRankName: RankName | null;
  totalArticles: number;
  qualifiedArticlesForNextRank: number;
  requiredArticlesForNextRank: number;
  perArticleThresholdForNextRank: number;
  coveragePctForNextRank: number;
  progressToNext: number;
  ranksBreakdown: RankBreakdownRow[];
  coveragePct: number;
  reachedArticles: number;
};

/** Fallback: derive article keys from questions when articles table is empty. */
async function getArticleKeysFromQuestions(): Promise<string[]> {
  const { data } = await supabase.from("questions").select("article");
  const set = new Set<string>();
  for (const row of data ?? []) {
    const key = getArticleKey((row as { article?: string }).article ?? "");
    if (key !== "Unknown") set.add(key);
  }
  return Array.from(set);
}

export async function getRankSummary(userId: string): Promise<RankSummary | null> {
  try {
    let articleKeys = await fetchActiveArticleKeys();
    if (articleKeys.length === 0) {
      articleKeys = await getArticleKeysFromQuestions();
    }

    const { data: masteryRows } = await supabase
      .from("article_mastery")
      .select("article, mastery_pct")
      .eq("user_id", userId);

    const rows = (masteryRows ?? []) as { article?: string; mastery_pct?: number | null }[];
    const activeArticles = articleKeys.map((article) => ({ article }));
    const state = computeRankState(activeArticles, rows);

    return {
      currentRankName: state.currentRank,
      nextRankName: state.nextRank,
      totalArticles: state.totalArticles,
      qualifiedArticlesForNextRank: state.qualifiedForNextRank,
      requiredArticlesForNextRank: state.requiredForNextRank,
      perArticleThresholdForNextRank: state.perArticleThresholdForNextRank,
      coveragePctForNextRank: state.coveragePctForNextRank,
      progressToNext: state.progressToNext,
      ranksBreakdown: state.ranksBreakdown,
      coveragePct: state.coveragePct,
      reachedArticles: state.qualifiedArticles,
    };
  } catch {
    return null;
  }
}
