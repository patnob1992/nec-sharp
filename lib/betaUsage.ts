/**
 * Beta usage tracking — fail silently, never break UI.
 * Events: app_open, session_start, session_complete
 */

import { supabase } from "./supabase";

export type BetaUsageEventType = "app_open" | "session_start" | "session_complete";

export type SessionCompleteMetadata = {
  accuracy: number;
  articlesImproved: number;
  score: number;
};

export async function trackBetaUsage(
  userId: string,
  eventType: BetaUsageEventType,
  metadata?: SessionCompleteMetadata | null
): Promise<void> {
  try {
    const meta = metadata ?? {};
    await supabase.from("beta_usage").insert({
      user_id: userId,
      event: eventType,
      meta,
    });
  } catch (e) {
    console.warn("[beta_usage] insert failed:", e);
  }
}
