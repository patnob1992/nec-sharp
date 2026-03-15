/**
 * Beta feedback — save user feedback for closed beta.
 */

import { supabase } from "./supabase";

export async function submitBetaFeedback(userId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Message is required" };

  try {
    const { error } = await supabase.from("beta_feedback").insert({
      user_id: userId,
      message: trimmed,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not send. Please try again." };
  }
}
