/**
 * Upsert article_mastery on each answer. Fail silently.
 */

import { supabase } from "./supabase";
import { getArticleKey } from "./progression";

export async function upsertArticleMastery(
  userId: string,
  article: string,
  isCorrect: boolean
): Promise<void> {
  const key = getArticleKey(article);
  if (key === "Unknown") return;
  try {
    const { data: existing } = await supabase
      .from("article_mastery")
      .select("total_answered, total_correct")
      .eq("user_id", userId)
      .eq("article", key)
      .maybeSingle();

    const prevAnswered = (existing as { total_answered?: number } | null)?.total_answered ?? 0;
    const prevCorrect = (existing as { total_correct?: number } | null)?.total_correct ?? 0;
    const totalAnswered = prevAnswered + 1;
    const totalCorrect = prevCorrect + (isCorrect ? 1 : 0);
    const masteryPct = totalAnswered > 0 ? Math.round(100 * totalCorrect / totalAnswered) : 0;

    await supabase.from("article_mastery").upsert(
      {
        user_id: userId,
        article: key,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        mastery_pct: masteryPct,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,article" }
    );
  } catch {
    /* fail silently */
  }
}
