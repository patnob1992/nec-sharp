/**
 * Beta analytics — track usage for retention, completion, drop-off.
 * Events: daily_open, session_started, session_completed, questions_exit
 */

import { supabase } from "./supabase";

export type UsageEventType = "daily_open" | "session_started" | "session_completed" | "questions_exit";

export async function logUsageEvent(
  userId: string,
  eventType: UsageEventType,
  payload?: { questions_completed?: number }
): Promise<void> {
  try {
    await supabase.from("usage_events").insert({
      user_id: userId,
      event_type: eventType,
      questions_completed: payload?.questions_completed ?? null,
    });
  } catch {
    // Fire-and-forget; don't block UX
  }
}

const DAILY_OPEN_KEY = "nec_sharp_lastDailyOpen";

export function shouldLogDailyOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(DAILY_OPEN_KEY);
    if (last === today) return false;
    localStorage.setItem(DAILY_OPEN_KEY, today);
    return true;
  } catch {
    return false;
  }
}
