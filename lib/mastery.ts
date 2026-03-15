/**
 * Server-side mastery via RPC. No client-side credit math.
 */

import { supabase } from "./supabase";

export async function applyQuestionResult(
  questionId: number,
  isCorrect: boolean
): Promise<unknown> {
  try {
    const { data, error } = await supabase.rpc("apply_question_result", {
      p_question_id: questionId,
      p_is_correct: isCorrect,
    });
    if (error) {
      console.warn("[applyQuestionResult] RPC error:", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn("[applyQuestionResult] Failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
