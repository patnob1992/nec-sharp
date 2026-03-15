/**
 * Algorithm-driven difficulty tiers.
 * Difficulty is derived from user level (or total_xp); not user-selectable.
 */

export type DifficultyTier = "Novice" | "Apprentice" | "Journeyman" | "Master" | "Legend"

export const DIFFICULTY_CONFIG = {
  /** Display name for the top tier (Level 15+). Tweak here to rename. */
  LEGEND_LABEL: "Legend" as const,

  /** Level thresholds for each tier. Level = floor(totalXP / 100) + 1 */
  THRESHOLDS: {
    NOVICE: { min: 1, max: 2 },
    APPRENTICE: { min: 3, max: 5 },
    JOURNEYMAN: { min: 6, max: 9 },
    MASTER: { min: 10, max: 14 },
    LEGEND: { min: 15, max: Infinity },
  },
} as const

export function getDifficulty(level: number): DifficultyTier {
  const l = Math.max(1, Math.floor(level))
  const { THRESHOLDS, LEGEND_LABEL } = DIFFICULTY_CONFIG

  if (l >= THRESHOLDS.LEGEND.min) return LEGEND_LABEL
  if (l >= THRESHOLDS.MASTER.min) return "Master"
  if (l >= THRESHOLDS.JOURNEYMAN.min) return "Journeyman"
  if (l >= THRESHOLDS.APPRENTICE.min) return "Apprentice"
  return "Novice"
}

/** Get display label for a tier (e.g. "Legend" vs "Grand-Master") */
export function getDifficultyLabel(tier: DifficultyTier): string {
  if (tier === "Legend") return DIFFICULTY_CONFIG.LEGEND_LABEL
  return tier
}

/**
 * Map tier to question difficulty for filtering.
 * Legend tier shows Master-level questions (highest in DB).
 * Novice tier includes "Green" (easiest) and "Novice".
 */
export function getQuestionFilterDifficulty(tier: DifficultyTier): string {
  if (tier === "Legend") return "Master"
  return tier
}

/** Returns acceptable question difficulties for filtering (e.g. Novice includes Green). */
export function getQuestionFilterDifficulties(tier: DifficultyTier): string[] {
  const primary = getQuestionFilterDifficulty(tier)
  if (tier === "Novice") return ["Green", "Novice"]
  return [primary]
}
