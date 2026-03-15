/**
 * Weekly performance stats. Week runs Sunday 00:00 UTC to Saturday 23:59 UTC.
 * Resets: weeklyAccuracy, weeklySessions, weeklyArticlesImproved, PPI.
 * Does NOT reset: lifetime XP, rank, level, article mastery.
 */

const STORAGE_KEY = "nec_sharp_weeklyStats"
const LAST_WEEK_SUMMARY_SHOWN_KEY = "nec_sharp_lastWeekSummaryShown"

/** Week key: YYYY-MM-DD of the Sunday 00:00 UTC that starts the current week. */
export function getWeekKey(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const daysToSunday = day === 0 ? 0 : -day
  const sunday = new Date(d)
  sunday.setUTCDate(d.getUTCDate() + daysToSunday)
  sunday.setUTCHours(0, 0, 0, 0)
  return sunday.toISOString().slice(0, 10)
}

export function getLastWeekSummaryShown(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(LAST_WEEK_SUMMARY_SHOWN_KEY)
  } catch {
    return null
  }
}

export function setLastWeekSummaryShown(weekKey: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LAST_WEEK_SUMMARY_SHOWN_KEY, weekKey)
  } catch {}
}

export type WeeklyStats = {
  weekKey: string
  sessionsCompleted: number
  totalCorrect: number
  totalAnswered: number
  xpGained: number
  articlesImproved: number
}

export function getStoredWeeklyStats(): WeeklyStats | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeeklyStats
    if (parsed?.weekKey && typeof parsed.sessionsCompleted === "number") return parsed
    return null
  } catch {
    return null
  }
}

export function recordWeeklySession(
  xpEarned: number,
  score: number,
  totalQuestions: number,
  articlesImprovedCount: number
): void {
  if (typeof window === "undefined") return
  const weekKey = getWeekKey()
  const stored = getStoredWeeklyStats()
  const base =
    stored?.weekKey === weekKey
      ? stored
      : {
          weekKey,
          sessionsCompleted: 0,
          totalCorrect: 0,
          totalAnswered: 0,
          xpGained: 0,
          articlesImproved: 0,
        }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        weekKey,
        sessionsCompleted: base.sessionsCompleted + 1,
        totalCorrect: base.totalCorrect + score,
        totalAnswered: base.totalAnswered + totalQuestions,
        xpGained: base.xpGained + xpEarned,
        articlesImproved: base.articlesImproved + articlesImprovedCount,
      })
    )
  } catch {}
}
