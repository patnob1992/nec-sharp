/**
 * Gamified progression: Level (momentum), Rank (competence), Status (maintenance).
 * Level: lifetime XP, numeric only, never regresses.
 * Rank: article mastery, titles, never regresses. Uses rankEngine as single source of truth.
 * Status: dynamic, solid | needs_refresh.
 */

import type { Question } from "@/data/questions";
import { getRank } from "./rankEngine";

// Storage keys
const TOTAL_XP_KEY = "nec_sharp_totalXp";
const ARTICLE_MASTERY_KEY = "nec_sharp_articleMastery";
const HIGHEST_RANK_KEY = "nec_sharp_highestRankAchieved";
const STATUS_KEY = "nec_sharp_status";
const LAST_LEVEL_UP_AT_XP_KEY = "nec_sharp_lastLevelUpAtXp";
const LAST_MILESTONE_SHOWN_KEY = "nec_sharp_lastMilestoneShown";

// Legacy migration
const LEGACY_XP_KEY = "nec_sharp_xp";

export const XP_PER_CORRECT = 10;
export const LEVEL_UP_BONUS = 20;
export const PERFECT_RUN_BONUS = 20;
export const STATUS_RECOVERY_BONUS = 20;

export type Status = "solid" | "needs_refresh";

export const RANK_REQUIREMENTS = [
  { label: "Novice", coverage: 0, articleThreshold: 0 },
  { label: "Apprentice", coverage: 0.1, articleThreshold: 0.5 },
  { label: "Journeyman", coverage: 0.25, articleThreshold: 0.7 },
  { label: "Master", coverage: 0.6, articleThreshold: 0.85 },
  { label: "Legend", coverage: 0.9, articleThreshold: 0.95 },
] as const;

/** Cumulative XP thresholds: Level N starts at threshold[N-1] */
const LEVEL_THRESHOLDS: number[] = [
  0, 80, 180, 300, 450, 630, 850, 1110, 1420, 1790,
];

function getLevelThreshold(level: number): number {
  if (level <= 0) return 0;
  if (level <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[level - 1] ?? 0;
  }
  let prev = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] ?? 1790;
  for (let L = LEVEL_THRESHOLDS.length + 1; L <= level; L++) {
    prev = prev + L * 80;
  }
  return prev;
}

/** Ensure XP is always a multiple of 10 */
function roundToTen(n: number): number {
  return Math.max(0, Math.floor(n / 10) * 10);
}

// ─── XP ─────────────────────────────────────────────────────────────────────

export function getXp(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(TOTAL_XP_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return roundToTen(Math.max(0, Math.floor(n)));
    }
    const legacy = localStorage.getItem(LEGACY_XP_KEY);
    if (legacy != null) {
      const n = Number(legacy);
      if (Number.isFinite(n)) {
        const migrated = roundToTen(Math.max(0, Math.floor(n)));
        setXp(migrated);
        try {
          localStorage.removeItem(LEGACY_XP_KEY);
        } catch {}
        return migrated;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export function setXp(n: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOTAL_XP_KEY, String(roundToTen(Math.max(0, Math.floor(n)))));
  } catch {}
}

export function addXp(delta: number) {
  setXp(getXp() + roundToTen(delta));
}

// ─── Level ──────────────────────────────────────────────────────────────────

export function getLevelFromXp(totalXp: number): {
  level: number;
  xpInto: number;
  xpForNext: number;
  levelStartXp: number;
  nextLevelStartXp: number;
} {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (getLevelThreshold(level + 1) <= xp) {
    level++;
    if (level > 999) break;
  }
  const levelStartXp = getLevelThreshold(level);
  const nextLevelStartXp = getLevelThreshold(level + 1);
  const xpForNext = nextLevelStartXp - levelStartXp;
  const xpInto = xp - levelStartXp;
  return {
    level,
    xpInto: Math.max(0, xpInto),
    xpForNext: Math.max(1, xpForNext),
    levelStartXp,
    nextLevelStartXp,
  };
}

export function xpRequiredForLevel(level: number): number {
  const start = getLevelThreshold(level);
  const next = getLevelThreshold(level + 1);
  return next - start;
}

// ─── Article Mastery (correctCount / totalAttempts) ───────────────────────────

export type ArticleMasteryEntry = { correctCount: number; totalAttempts: number };
export type ArticleMastery = Record<string, ArticleMasteryEntry>;

export function getArticleKey(article: string): string {
  const raw = (article ?? "").trim();
  if (!raw) return "Unknown";
  const m = raw.match(/^(\d+(?:\.\d+)?)/);
  if (m?.[1]) return m[1];
  return raw;
}

const LEGACY_ARTICLE_STATS_KEY = "necsharp_articleStats";

export function getArticleMastery(): ArticleMastery {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ARTICLE_MASTERY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const out: ArticleMastery = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k !== "string") continue;
          const entry = v as { correctCount?: number; totalAttempts?: number };
          const correctCount = typeof entry.correctCount === "number" ? Math.max(0, Math.floor(entry.correctCount)) : 0;
          const totalAttempts = typeof entry.totalAttempts === "number" ? Math.max(0, Math.floor(entry.totalAttempts)) : 0;
          if (totalAttempts > 0 || correctCount > 0) {
            out[k] = { correctCount, totalAttempts: Math.max(totalAttempts, correctCount) };
          }
        }
        return out;
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_ARTICLE_STATS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as unknown;
      if (parsed && typeof parsed === "object") {
        const merged = new Map<string, { correctCount: number; totalAttempts: number }>();
        for (const [articleStr, v] of Object.entries(parsed)) {
          if (typeof articleStr !== "string") continue;
          const entry = v as { attempts?: number; correct?: number };
          const attempts = typeof entry.attempts === "number" ? Math.max(0, entry.attempts) : 0;
          const correct = typeof entry.correct === "number" ? Math.max(0, entry.correct) : 0;
          if (attempts === 0 && correct === 0) continue;
          const key = getArticleKey(articleStr);
          if (key === "Unknown") continue;
          const cur = merged.get(key) ?? { correctCount: 0, totalAttempts: 0 };
          merged.set(key, {
            correctCount: cur.correctCount + correct,
            totalAttempts: cur.totalAttempts + Math.max(attempts, correct),
          });
        }
        const out: ArticleMastery = {};
        for (const [k, v] of merged) {
          out[k] = v;
        }
        setArticleMastery(out);
        try {
          localStorage.removeItem(LEGACY_ARTICLE_STATS_KEY);
        } catch {}
        return out;
      }
    }
    return {};
  } catch {
    return {};
  }
}

export function setArticleMastery(m: ArticleMastery) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ARTICLE_MASTERY_KEY, JSON.stringify(m));
  } catch {}
}

export function recordArticleAttempt(article: string, isCorrect: boolean) {
  const key = getArticleKey(article);
  if (key === "Unknown") return;
  const m = getArticleMastery();
  const cur = m[key] ?? { correctCount: 0, totalAttempts: 0 };
  m[key] = {
    correctCount: cur.correctCount + (isCorrect ? 1 : 0),
    totalAttempts: cur.totalAttempts + 1,
  };
  setArticleMastery(m);
}

// ─── Rank (never regresses) ──────────────────────────────────────────────────

export function getHighestRankAchieved(): (typeof RANK_REQUIREMENTS)[number]["label"] {
  if (typeof window === "undefined") return "Novice";
  try {
    const raw = localStorage.getItem(HIGHEST_RANK_KEY);
    if (!raw) return "Novice";
    const label = raw.trim();
    if (RANK_REQUIREMENTS.some((r) => r.label === label)) return label as (typeof RANK_REQUIREMENTS)[number]["label"];
    return "Novice";
  } catch {
    return "Novice";
  }
}

export function setHighestRankAchieved(label: (typeof RANK_REQUIREMENTS)[number]["label"]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HIGHEST_RANK_KEY, label);
  } catch {}
}

function getArticleKeysFromQuestions(questions: Question[]): string[] {
  const keys = new Set<string>();
  for (const q of questions) {
    const key = getArticleKey(q.article);
    if (key !== "Unknown") keys.add(key);
  }
  return Array.from(keys);
}

export function computeRankFromMastery(
  questions: Question[],
  mastery: ArticleMastery
): (typeof RANK_REQUIREMENTS)[number] {
  const articleKeys = getArticleKeysFromQuestions(questions);
  const userStats: Record<string, { correctCount: number; totalAttempts: number }> = {};
  for (const key of articleKeys) {
    const entry = mastery[key];
    userStats[key] = entry
      ? { correctCount: entry.correctCount, totalAttempts: entry.totalAttempts }
      : { correctCount: 0, totalAttempts: 0 };
  }
  const result = getRank(userStats, articleKeys);
  return RANK_REQUIREMENTS[result.rankIndex];
}

// ─── Status (dynamic) ──────────────────────────────────────────────────────

export function getStatus(): Status {
  if (typeof window === "undefined") return "solid";
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (raw === "needs_refresh" || raw === "solid") return raw;
    return "solid";
  } catch {
    return "solid";
  }
}

export function setStatus(s: Status) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATUS_KEY, s);
  } catch {}
}

export function computeStatus(
  questions: Question[],
  mastery: ArticleMastery,
  highestRankLabel: string
): Status {
  const articleKeys = getArticleKeysFromQuestions(questions);
  const userStats: Record<string, { correctCount: number; totalAttempts: number }> = {};
  for (const key of articleKeys) {
    const entry = mastery[key];
    userStats[key] = entry
      ? { correctCount: entry.correctCount, totalAttempts: entry.totalAttempts }
      : { correctCount: 0, totalAttempts: 0 };
  }
  const result = getRank(userStats, articleKeys);
  const highestIdx = RANK_REQUIREMENTS.findIndex((r) => r.label === highestRankLabel);
  const highestRankIndex = highestIdx >= 0 ? highestIdx : 0;
  return result.rankIndex >= highestRankIndex ? "solid" : "needs_refresh";
}

export function getWeakArticles(
  questions: Question[],
  mastery: ArticleMastery,
  highestRankLabel: string
): string[] {
  const req = RANK_REQUIREMENTS.find((r) => r.label === highestRankLabel) ?? RANK_REQUIREMENTS[0];
  const articleKeys = getArticleKeysFromQuestions(questions);
  const weak: string[] = [];
  for (const key of articleKeys) {
    const entry = mastery[key];
    const correct = entry?.correctCount ?? 0;
    const total = entry?.totalAttempts ?? 0;
    const pct = total > 0 ? correct / total : 0;
    if (pct < req.articleThreshold) weak.push(key);
  }
  return weak.sort();
}

// ─── Level Up Tracking ───────────────────────────────────────────────────────

export function getLastLevelUpAtXp(): number {
  if (typeof window === "undefined") return -1;
  try {
    const raw = localStorage.getItem(LAST_LEVEL_UP_AT_XP_KEY);
    if (!raw) return -1;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n) : -1;
  } catch {
    return -1;
  }
}

export function setLastLevelUpAtXp(xp: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_LEVEL_UP_AT_XP_KEY, String(Math.max(0, Math.floor(xp))));
  } catch {}
}

// ─── Milestone Tracking ─────────────────────────────────────────────────────

export type MilestoneShown = "none" | "50" | "75" | "90";

export function getLastMilestoneShown(): MilestoneShown {
  if (typeof window === "undefined") return "none";
  try {
    const raw = localStorage.getItem(LAST_MILESTONE_SHOWN_KEY);
    if (raw === "50" || raw === "75" || raw === "90") return raw;
    return "none";
  } catch {
    return "none";
  }
}

export function setLastMilestoneShown(m: MilestoneShown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_MILESTONE_SHOWN_KEY, m);
  } catch {}
}

export function resetMilestoneForNewLevel() {
  setLastMilestoneShown("none");
}

// ─── Level Unlocks ─────────────────────────────────────────────────────────

export const LEVEL_UNLOCKS: Record<number, string> = {
  2: "Streak progress (+10/day)",
  3: "Hard Mode Questions",
  4: "Mastery Badges",
  5: "Weekly Challenge",
  6: "Speed Round",
  7: "Mistake Review",
  8: "Expert Sets",
  9: "Profile Accent",
  10: "Legend Frame",
};

export function getUnlockText(level: number): string {
  return LEVEL_UNLOCKS[level] ?? "Coming soon";
}

// ─── Article Progress (for UI) ──────────────────────────────────────────────

export type ArticleProgressRow = {
  articleKey: string;
  title?: string;
  total: number;
  masteredCount: number;
  progressPct: number;
  correctCount: number;
  totalAttempts: number;
};

export function computeArticleProgress(
  questions: Question[],
  mastery: ArticleMastery
): ArticleProgressRow[] {
  const byKey = new Map<
    string,
    { total: number; correctCount: number; totalAttempts: number; title?: string }
  >();
  for (const q of questions) {
    const key = getArticleKey(q.article);
    if (key === "Unknown") continue;
    const cur = byKey.get(key) ?? { total: 0, correctCount: 0, totalAttempts: 0, title: undefined };
    cur.total += 1;
    const entry = mastery[key];
    if (entry) {
      cur.correctCount += entry.correctCount;
      cur.totalAttempts += entry.totalAttempts;
    }
    if (!cur.title) cur.title = q.article.trim();
    byKey.set(key, cur);
  }
  const rows: ArticleProgressRow[] = [];
  for (const [articleKey, { total, correctCount, totalAttempts, title }] of byKey) {
    const progressPct = totalAttempts > 0 ? correctCount / totalAttempts : 0;
    const meetsNoviceThreshold = progressPct >= 0.5;
    rows.push({
      articleKey,
      title,
      total,
      masteredCount: meetsNoviceThreshold ? total : 0,
      progressPct,
      correctCount,
      totalAttempts,
    });
  }
  rows.sort((a, b) => a.progressPct - b.progressPct);
  return rows;
}

/** Article row from public.articles for coverage UI. */
export type ActiveArticle = { article: string; title?: string | null };

/**
 * Compute progress for all active articles (from public.articles).
 * Shows all articles even when question_count is 0.
 */
export function computeArticleProgressFromArticles(
  activeArticles: ActiveArticle[],
  mastery: ArticleMastery,
  questions: Question[]
): ArticleProgressRow[] {
  const questionCountByKey = new Map<string, number>();
  const titleByKey = new Map<string, string>();
  for (const q of questions) {
    const key = getArticleKey(q.article);
    if (key === "Unknown") continue;
    questionCountByKey.set(key, (questionCountByKey.get(key) ?? 0) + 1);
    if (!titleByKey.has(key)) titleByKey.set(key, q.article.trim());
  }
  const rows: ArticleProgressRow[] = [];
  for (const { article: key, title } of activeArticles) {
    const total = questionCountByKey.get(key) ?? 0;
    const entry = mastery[key];
    const correctCount = entry?.correctCount ?? 0;
    const totalAttempts = entry?.totalAttempts ?? 0;
    const progressPct = totalAttempts > 0 ? correctCount / totalAttempts : 0;
    const meetsNoviceThreshold = progressPct >= 0.5;
    rows.push({
      articleKey: key,
      title: title ?? titleByKey.get(key),
      total,
      masteredCount: meetsNoviceThreshold ? total : 0,
      progressPct,
      correctCount,
      totalAttempts,
    });
  }
  rows.sort((a, b) => a.progressPct - b.progressPct);
  return rows;
}

export type ArticleStat = {
  articleKey: string;
  total: number;
  mastered: number;
  pct: number;
  meetsThreshold: boolean;
};

export function computeArticleStats(
  questions: Question[],
  mastery: ArticleMastery,
  articleThreshold: number
): {
  totalArticles: number;
  reachedArticles: number;
  coveragePct: number;
  perArticle: ArticleStat[];
} {
  const byKey = new Map<string, { total: number; correct: number; attempts: number }>();
  for (const q of questions) {
    const key = getArticleKey(q.article);
    if (key === "Unknown") continue;
    const cur = byKey.get(key) ?? { total: 0, correct: 0, attempts: 0 };
    cur.total += 1;
    const entry = mastery[key];
    if (entry) {
      cur.correct += entry.correctCount;
      cur.attempts += entry.totalAttempts;
    }
    byKey.set(key, cur);
  }
  const totalArticles = byKey.size;
  const perArticle: ArticleStat[] = [];
  let reachedArticles = 0;
  for (const [articleKey, { total, correct, attempts }] of byKey) {
    const pct = attempts > 0 ? correct / attempts : 0;
    const meetsThreshold = pct >= articleThreshold;
    if (meetsThreshold) reachedArticles++;
    perArticle.push({ articleKey, total, mastered: meetsThreshold ? total : 0, pct, meetsThreshold });
  }
  perArticle.sort((a, b) => a.pct - b.pct);
  const coveragePct = totalArticles > 0 ? reachedArticles / totalArticles : 0;
  return { totalArticles, reachedArticles, coveragePct, perArticle };
}

export type RankInfo = {
  current: (typeof RANK_REQUIREMENTS)[number];
  next: (typeof RANK_REQUIREMENTS)[number] | null;
  progressToNext: number;
  reachedArticles: number;
  requiredForNext: number;
  totalArticles: number;
  coveragePct: number;
};

export function getRankInfo(questions: Question[], mastery: ArticleMastery): RankInfo {
  const articleKeys = getArticleKeysFromQuestions(questions);
  const userStats: Record<string, { correctCount: number; totalAttempts: number }> = {};
  for (const key of articleKeys) {
    const entry = mastery[key];
    userStats[key] = entry
      ? { correctCount: entry.correctCount, totalAttempts: entry.totalAttempts }
      : { correctCount: 0, totalAttempts: 0 };
  }
  const result = getRank(userStats, articleKeys);
  const current = RANK_REQUIREMENTS[result.rankIndex];
  const next =
    result.rankIndex < RANK_REQUIREMENTS.length - 1 ? RANK_REQUIREMENTS[result.rankIndex + 1] : null;
  const totalArticles = Math.max(1, articleKeys.length);
  const requiredForNext = next ? Math.ceil(totalArticles * next.coverage) : result.qualifiedArticlesCount;
  return {
    current,
    next,
    progressToNext: result.progressToNextRank,
    reachedArticles: result.qualifiedArticlesCount,
    requiredForNext,
    totalArticles,
    coveragePct: result.coveragePercent,
  };
}

// ─── Article Delta (session progress) ──────────────────────────────────────

export type ArticleDeltaRow = {
  articleKey: string;
  beforePct: number;
  afterPct: number;
  deltaPct: number;
  masteredBefore: number;
  masteredAfter: number;
  total: number;
};

export function computeArticleDelta(
  questions: Question[],
  sessionQuestionIds: string[],
  startMastery: ArticleMastery,
  endMastery: ArticleMastery
): ArticleDeltaRow[] {
  const sessionIds = new Set(sessionQuestionIds);
  const sessionArticleKeys = new Set<string>();
  for (const q of questions) {
    if (sessionIds.has(q.id)) {
      const key = getArticleKey(q.article);
      if (key !== "Unknown") sessionArticleKeys.add(key);
    }
  }
  const before = computeArticleProgress(questions, startMastery);
  const after = computeArticleProgress(questions, endMastery);
  const beforeMap = new Map(before.map((r) => [r.articleKey, r]));
  const afterMap = new Map(after.map((r) => [r.articleKey, r]));
  const delta: ArticleDeltaRow[] = [];
  for (const key of sessionArticleKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!a) continue;
    const beforePct = b?.progressPct ?? 0;
    const afterPct = a.progressPct;
    if (beforePct === afterPct && (b?.masteredCount ?? 0) === a.masteredCount) continue;
    delta.push({
      articleKey: key,
      beforePct,
      afterPct,
      deltaPct: afterPct - beforePct,
      masteredBefore: b?.masteredCount ?? 0,
      masteredAfter: a.masteredCount,
      total: a.total,
    });
  }
  delta.sort((x, y) => y.deltaPct - x.deltaPct);
  return delta;
}

// ─── Legacy compatibility (for wrong queue, etc.) ──────────────────────────

/** @deprecated Use getArticleMastery. Kept for wrong-queue prioritization. */
export type WrongMastery = Record<string, number>;

/** @deprecated Returns empty. Wrong queue still uses question IDs for prioritization. */
export function getWrongMastery(): WrongMastery {
  return {};
}

/** @deprecated No-op. */
export function setWrongMastery(_m: WrongMastery) {}

export const MASTERY_TARGET = 3;
