"use client"

/**
 * Daily 5 session behavior (self-healing).
 *
 * Session rebuilds automatically when: (1) day changes, (2) question set signature changes,
 * (3) stored session contains ids not in loaded questions, (4) stored completedCount out of range.
 * Session length = min(SESSION_SIZE, questions.length). IDs are always unique; wrongQueue first, then random fill.
 *
 * Verification: (1) Start with 3 questions — confirm "Question 1 of 3" and no duplicates.
 * (2) Add rows in Supabase, reload page — session rebuilds without clearing localStorage.
 * (3) completedCount is clamped to ids.length so progress never exceeds session length.
 *
 * DEBUG_SESSION = true enables console logs and a small footer; keep false in production.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  questions as localQuestions,
  mapDbRowToQuestion,
  type DbQuestionRow,
  type Question,
} from "../data/questions"
import { supabase } from "../lib/supabase"
import { getDifficulty, getQuestionFilterDifficulties } from "../lib/difficulty"
import type { ArticleMastery } from "../lib/progression"
import {
  addXp,
  computeArticleDelta,
  computeRankFromMastery,
  computeStatus,
  getArticleMastery,
  getLevelFromXp as getLevelFromXpProgression,
  getHighestRankAchieved,
  getLastLevelUpAtXp,
  getLastMilestoneShown,
  getStatus,
  getRankInfo,
  getUnlockText,
  getWeakArticles,
  getXp,
  LEVEL_UP_BONUS,
  PERFECT_RUN_BONUS,
  recordArticleAttempt as recordArticleAttemptProgression,
  resetMilestoneForNewLevel,
  setHighestRankAchieved,
  setLastLevelUpAtXp,
  setLastMilestoneShown,
  setStatus,
  STATUS_RECOVERY_BONUS,
  XP_PER_CORRECT,
} from "../lib/progression"
import { recordWeeklySession } from "../lib/weeklyStats"
import { upsertPerformanceScore } from "../lib/leaderboard"
import { getDivisionFromProgress } from "../lib/rankEngine"
import { trackBetaUsage } from "../lib/betaUsage"
import { FeedbackModal } from "../app/components/FeedbackModal"
import { applyQuestionResult } from "../lib/mastery"

const SESSION_SIZE = 5
const MAX_WRONG_QUEUE = 20
const DEBUG_SESSION = false

const STORAGE_KEYS = {
  wrongQueue: "nec_sharp_wrongQueue",
  session: "nec_sharp_session",
  sessionMeta: "nec_sharp_sessionMeta",
  todayProgress: "nec_sharp_todayProgress",
  questionSetMeta: "nec_sharp_questionSetMeta",
  optionSeed: "nec_sharp_optionSeed",
}

type SessionMeta = { dayKey: string; signature: string; levelSnapshot: number; difficultyTier: string }

function getStoredSessionMeta(): SessionMeta | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessionMeta)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionMeta
    if (parsed?.dayKey && parsed?.signature != null) return parsed
    return null
  } catch {
    return null
  }
}

function setStoredSessionMeta(meta: SessionMeta) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.sessionMeta, JSON.stringify(meta))
  } catch {}
}

function computeQuestionSetSignature(questions: Question[]): string {
  const count = questions.length
  let maxNumericId = 0
  for (const q of questions) {
    const n = Number(q.id)
    if (Number.isFinite(n) && n > maxNumericId) maxNumericId = n
  }
  return `${count}:${maxNumericId}`
}

function setStoredQuestionSetMeta(signature: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.questionSetMeta, signature)
  } catch {}
}

function getDayKey() {
  return new Date().toLocaleDateString()
}

function getStoredWrongQueue(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.wrongQueue)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function setStoredWrongQueue(next: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.wrongQueue, JSON.stringify(next))
  } catch {}
}

function addToWrongQueueCapped(questionId: string) {
  const queue = getStoredWrongQueue()
  if (queue.includes(questionId)) return
  setStoredWrongQueue([questionId, ...queue].slice(0, MAX_WRONG_QUEUE))
}

function removeFromWrongQueue(questionId: string) {
  const queue = getStoredWrongQueue()
  setStoredWrongQueue(queue.filter((x) => x !== questionId))
}

type StoredSession = { dayKey: string; questionIds: string[]; difficultyBand?: string }

function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { dayKey?: string; questionIds?: string[]; difficultyBand?: string }
    if (parsed?.dayKey && Array.isArray(parsed?.questionIds)) return parsed as StoredSession
    return null
  } catch {
    return null
  }
}

function setStoredSession(session: StoredSession) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session))
  } catch {}
}

type TodayProgress = { dayKey: string; score: number; missedIds: string[]; completedCount: number }

function getStoredTodayProgress(): TodayProgress | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.todayProgress)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TodayProgress
    if (parsed?.dayKey != null && typeof parsed.score === "number" && Array.isArray(parsed.missedIds) && typeof parsed.completedCount === "number")
      return parsed
    return null
  } catch {
    return null
  }
}

function setStoredTodayProgress(progress: TodayProgress) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.todayProgress, JSON.stringify(progress))
  } catch {}
}

function getStoredQuestionSetMeta(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.questionSetMeta)
    if (!raw) return null
    if (typeof raw === "string" && raw.length > 0) return raw
    return null
  } catch {
    return null
  }
}

type OptionSeed = { dayKey: string; seed: string }

function getStoredOptionSeed(): OptionSeed | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.optionSeed)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { dayKey?: string; seed?: string }
    if (parsed?.dayKey && typeof parsed?.seed === "string") return parsed as OptionSeed
    return null
  } catch {
    return null
  }
}

function setStoredOptionSeed(x: OptionSeed) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.optionSeed, JSON.stringify(x))
  } catch {}
}

function getOrCreateOptionSeed(dayKey: string): string {
  const stored = getStoredOptionSeed()
  if (stored && stored.dayKey === dayKey) return stored.seed
  const seed =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-")
      : `${Math.random().toString(36)}-${Math.random().toString(36)}-${Math.random().toString(36)}-${Math.random().toString(36)}`
  setStoredOptionSeed({ dayKey, seed })
  return seed
}

function hashStringToUint32(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h = h >>> 0
  }
  return h
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWithRng<T>(arr: T[], rnd: () => number): T[] {
  const indices = arr.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices.map((i) => arr[i])
}

function getQuestionById(allQuestions: Question[], id: string): Question | undefined {
  return allQuestions.find((q) => q.id === id)
}

function buildNewSession(dayKey: string, allQuestions: Question[]): string[] {
  void dayKey
  const maxUnique = Math.min(SESSION_SIZE, allQuestions.length)
  if (maxUnique === 0) return []

  const availableIds = allQuestions.map((q) => q.id)
  const availableSet = new Set(availableIds)
  const uniqueIds: string[] = []

  const wrongQueue = getStoredWrongQueue()
  const shuffledWrongQueue = [...wrongQueue]
  for (let i = shuffledWrongQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledWrongQueue[i], shuffledWrongQueue[j]] = [shuffledWrongQueue[j], shuffledWrongQueue[i]]
  }
  for (const id of shuffledWrongQueue) {
    if (uniqueIds.length >= maxUnique) break
    if (availableSet.has(id) && !uniqueIds.includes(id)) uniqueIds.push(id)
  }

  const remaining = availableIds.filter((id) => !uniqueIds.includes(id))
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
  }
  for (const id of remaining) {
    if (uniqueIds.length >= maxUnique) break
    uniqueIds.push(id)
  }

  return uniqueIds.slice(0, maxUnique)
}

function badgeStyle(bg: string, color: string) {
  return {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600 as const,
    background: bg,
    color,
    border: "1px solid rgba(255,255,255,0.08)",
  }
}

function isPerfectScore(score: number, total: number): boolean {
  return total > 0 && score === total
}

function getStreakTier(streak: number): string {
  if (streak >= 100) return "legend"
  if (streak >= 30) return "gold"
  if (streak >= 14) return "strong"
  if (streak >= 7) return "medium"
  if (streak >= 3) return "small"
  return "minimal"
}

function getPerformanceLine(score: number, total: number): string {
  if (total <= 0) return "Solid session."
  if (score >= total) return "Clean session. Dialed in."
  if (score >= 4) return "Strong fundamentals."
  if (score >= 3) return "Solid session."
  if (score >= 2) return "Room to sharpen."
  return "Recalibrate tomorrow."
}

function getMilestoneMessage(streak: number): string | null {
  if (streak >= 100) return "100 days."
  if (streak >= 30) return "30 days."
  if (streak >= 14) return "Two weeks."
  if (streak >= 7) return "One week."
  if (streak >= 3) return "Log in tomorrow."
  return null
}

function isMilestoneStreak(streak: number): boolean {
  return streak >= 3
}

type QuizMode = "quiz" | "complete" | "review"

export default function Home() {
  const router = useRouter()
  const [userLevel, setUserLevel] = useState(1)
  const [userLevelLoaded, setUserLevelLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"] | null = null
      try {
        const { data } = await supabase.auth.getSession()
        sessionData = data
      } catch (error) {
        console.error("[quiz-init] getSession failed:", error)
      }
      if (!sessionData?.session) {
        router.replace("/login")
        return
      }
      userRef.current = sessionData.session.user.id
      const xp = getXp()
      const { level } = getLevelFromXpProgression(xp)
      setUserLevel(Math.max(1, level))
      setUserLevelLoaded(true)
    })()
  }, [router])

  const [completionStreak, setCompletionStreak] = useState<number | null>(null)
  const [animatedStreak, setAnimatedStreak] = useState(0)
  const [animatedXpEarned, setAnimatedXpEarned] = useState(0)
  const [animateIn, setAnimateIn] = useState(false)
  const [completionXp, setCompletionXp] = useState<{
    xpEarned: number
    totalXP: number
    level: number
    leveledUp: boolean
    milestoneToast: string | null
    levelUpUnlockText: string | null
    rankUp: boolean
    newRankName: string | null
  } | null>(null)
  const [showLevelUpModal, setShowLevelUpModal] = useState(false)
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null)

  useEffect(() => {
    if (!milestoneToast) return
    const t = setTimeout(() => setMilestoneToast(null), 4000)
    return () => clearTimeout(t)
  }, [milestoneToast])
  useEffect(() => {
    const streak = completionStreak
    const isValid = typeof streak === "number" && Number.isFinite(streak)
    if (!isValid) return

    setAnimateIn(true)
    setAnimatedStreak(0)

    const duration = 700
    const startTime = performance.now()
    let rafId: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) ** 2
      const current = Math.round(eased * streak)
      setAnimatedStreak(current)
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [completionStreak])

  useEffect(() => {
    const xp = completionXp?.xpEarned
    if (typeof xp !== "number" || !Number.isFinite(xp)) return
    setAnimatedXpEarned(0)
    const duration = 400
    const startTime = performance.now()
    let rafId: number
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) ** 2
      setAnimatedXpEarned(Math.round(eased * xp))
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [completionXp?.xpEarned])

  const finishSession = useCallback(
    async (score: number, totalQuestions: number, questionIds: string[]): Promise<{
      xpEarned: number
      totalXP: number
      level: number
      leveledUp: boolean
      milestoneToast: string | null
      levelUpUnlockText: string | null
      rankUp: boolean
      newRankName: string | null
    } | null> => {
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null
      try {
        const { data } = await supabase.auth.getSession()
        session = data.session
      } catch (error) {
        console.error("[finishSession] getSession failed:", error)
      }
      const user = session?.user
      if (!user) return null

      const alreadyCompletedToday = localStorage.getItem("practice_completed_today") === "true"
      let streakForScore = 0

      if (!alreadyCompletedToday) {
        const today = new Date()
        const localDate = today.toISOString().split("T")[0]

        const { data: profile } = await supabase
          .from("profiles")
          .select("streak")
          .eq("id", user.id)
          .single()

        const newStreak = (profile?.streak || 0) + 1
        streakForScore = newStreak

        const { data, error } = await supabase
          .from("profiles")
          .update({
            streak: newStreak,
            last_completed_date: localDate,
          })
          .eq("id", user.id)
          .select("streak")
          .single()

        if (!error && data?.streak != null) {
          setCompletionStreak(data.streak)
        }

        localStorage.setItem("practice_completed_today", "true")
      } else {
        const { data: existing } = await supabase
          .from("profiles")
          .select("streak")
          .eq("id", user.id)
          .single()

        streakForScore = existing?.streak ?? 0
        if (existing?.streak != null) {
          setCompletionStreak(existing.streak)
        }
      }

      let xpEarned = score * XP_PER_CORRECT
      const perfect = totalQuestions > 0 && score === totalQuestions
      if (perfect) xpEarned += PERFECT_RUN_BONUS

      addXp(xpEarned)
      let totalXP = getXp()

      const { level, xpInto, xpForNext, nextLevelStartXp } = getLevelFromXpProgression(totalXP)
      const lastLevelUpAtXpVal = getLastLevelUpAtXp()
      let leveledUp = false
      let levelUpUnlockText: string | null = null

      if (totalXP >= nextLevelStartXp && lastLevelUpAtXpVal < nextLevelStartXp) {
        addXp(LEVEL_UP_BONUS)
        xpEarned += LEVEL_UP_BONUS
        totalXP = getXp()
        setLastLevelUpAtXp(nextLevelStartXp)
        resetMilestoneForNewLevel()
        leveledUp = true
        levelUpUnlockText = getUnlockText(level + 1)
      }

      const mastery = getArticleMastery()
      const rank = computeRankFromMastery(questionsRef.current, mastery)

      const prevStatus = getStatus()
      const newStatus = computeStatus(questionsRef.current, mastery, getHighestRankAchieved())
      setStatus(newStatus)
      if (prevStatus === "needs_refresh" && newStatus === "solid") {
        addXp(STATUS_RECOVERY_BONUS)
        xpEarned += STATUS_RECOVERY_BONUS
        totalXP = getXp()
      }

      let milestoneToast: string | null = null
      if (!leveledUp) {
        const pct = xpForNext > 0 ? xpInto / xpForNext : 0
        const lastMilestone = getLastMilestoneShown()
        if (pct >= 0.9 && lastMilestone !== "90") {
          setLastMilestoneShown("90")
          milestoneToast = "Final stretch — 1–2 good runs and you're there."
        } else if (pct >= 0.75 && lastMilestone !== "75" && lastMilestone !== "90") {
          setLastMilestoneShown("75")
          milestoneToast = "You're close — next level is in reach."
        } else if (pct >= 0.5 && lastMilestone === "none") {
          setLastMilestoneShown("50")
          milestoneToast = `Halfway to Level ${level + 1}. Keep it moving.`
        }
      }

      const { data: stats } = await supabase
        .from("user_stats")
        .select("total_xp, total_answered, total_correct")
        .eq("user_id", user.id)
        .maybeSingle()

      const prevAnswered = (stats as { total_answered?: number } | null)?.total_answered ?? 0
      const prevCorrect = (stats as { total_correct?: number } | null)?.total_correct ?? 0
      const totalAnswered = prevAnswered + totalQuestions
      const totalCorrect = prevCorrect + score

      let articlesImprovedCount = 0
      if (startArticleMasteryRef.current != null) {
        const delta = computeArticleDelta(
          questionsRef.current,
          questionIds,
          startArticleMasteryRef.current,
          getArticleMastery()
        )
        articlesImprovedCount = delta.filter((r) => r.deltaPct >= 0.1).length
      }

      const rankResult = await upsertPerformanceScore(user.id, {
        totalXp: totalXP,
        totalAnswered,
        totalCorrect,
        sessionCorrect: score,
        sessionAnswered: totalQuestions,
        sessionArticlesImproved: articlesImprovedCount,
        streakLength: streakForScore,
        rankLabel: rank.label,
      })

      if (rankResult.rankUp && rankResult.newRankName) {
        setHighestRankAchieved(rankResult.newRankName)
      }

      recordWeeklySession(xpEarned, score, totalQuestions, articlesImprovedCount)

      try {
        trackBetaUsage(user.id, "session_complete", {
          accuracy: totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0,
          articlesImproved: articlesImprovedCount,
          score,
        })
      } catch {
        /* fail silently */
      }

      const dailyTargetToast = !alreadyCompletedToday ? "Daily target complete." : null

      return {
        xpEarned,
        totalXP,
        level,
        leveledUp,
        milestoneToast: milestoneToast ?? dailyTargetToast,
        levelUpUnlockText,
        rankUp: rankResult.rankUp,
        newRankName: rankResult.newRankName,
      }
    },
    []
  )

  const [initialized, setInitialized] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [nextQuestion, setNextQuestion] = useState<Question | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isQuestionTransitioning, setIsQuestionTransitioning] = useState(false)
  const [score, setScore] = useState(0)
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [mode, setMode] = useState<QuizMode>("quiz")
  const [completed, setCompleted] = useState(false)
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [reviewComplete, setReviewComplete] = useState(false)
  const [sessionRepairing, setSessionRepairing] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([])
  const [shuffledCorrectIndex, setShuffledCorrectIndex] = useState(0)
  const [shuffledForQuestionId, setShuffledForQuestionId] = useState<string | null>(null)
  const levelAtSessionStartRef = useRef<number>(1)
  const startArticleMasteryRef = useRef<ArticleMastery | null>(null)
  const questionsRef = useRef<Question[]>([])
  const sessionStartedLoggedRef = useRef(false)
  const userRef = useRef<string | null>(null)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dayKey = getDayKey()
  const currentQuestionId = sessionQuestionIds[questionIndex]
  const question = currentQuestion
  const sessionSize = sessionQuestionIds.length

  questionsRef.current = questions

  const preloadNextQuestion = useCallback(() => {
    const nextId = sessionQuestionIds[questionIndex + 1]
    setNextQuestion(nextId ? getQuestionById(questionsRef.current, nextId) ?? null : null)
  }, [questionIndex, sessionQuestionIds])

  const questionsKey = useMemo(
    () => (questions.length === 0 ? "empty" : `${questions.length}:${questions.map((q) => q.id).join(",")}`),
    [questions]
  )

  useEffect(() => {
    const id = sessionQuestionIds[questionIndex]
    setCurrentQuestion(id ? getQuestionById(questions, id) ?? null : null)
    const nextId = sessionQuestionIds[questionIndex + 1]
    setNextQuestion(nextId ? getQuestionById(questions, nextId) ?? null : null)
  }, [questionIndex, sessionQuestionIds, questionsKey])

  useEffect(() => {
    if (!currentQuestion) return
    preloadNextQuestion()
  }, [currentQuestion, preloadNextQuestion])

  const useShuffled = shuffledForQuestionId === currentQuestionId && shuffledOptions.length > 0
  const effectiveCorrectIndex = useShuffled ? shuffledCorrectIndex : question?.correctIndex ?? 0
  const displayOptions = useShuffled ? shuffledOptions : question?.options ?? []
  const result = useMemo(() => {
    if (!hasSubmitted || selected === null || !question) return null
    return selected === effectiveCorrectIndex ? "correct" : "wrong"
  }, [hasSubmitted, selected, question, effectiveCorrectIndex])

  useEffect(() => {
    if (!question) return
    const dailySeed = getOrCreateOptionSeed(dayKey)
    const perQuestionSeed = hashStringToUint32(dailySeed + "::" + question.id)
    const rng = mulberry32(perQuestionSeed)
    const indices = question.options.map((_, i) => i)
    const shuffledIndices = shuffleWithRng(indices, rng)
    const shuffled = shuffledIndices.map((i) => question.options[i])
    const correctIdx = shuffledIndices.indexOf(question.correctIndex)
    setShuffledOptions(shuffled)
    setShuffledCorrectIndex(correctIdx >= 0 ? correctIdx : 0)
    setShuffledForQuestionId(question.id)
    setSelected(null)
  }, [currentQuestionId, question, dayKey])

  useEffect(() => {
    if (selected === null) {
      setHasSubmitted(false)
    }
  }, [selected])

  const advanceToNext = useCallback(
    async (scoreOverride?: number) => {
      const nextIndex = questionIndex + 1
      const newCompletedCount = nextIndex
      const scoreToSave = scoreOverride ?? score
      if (nextIndex >= sessionQuestionIds.length) {
        if (isReviewMode) {
          setReviewComplete(true)
        } else {
          const xpResult = await finishSession(scoreToSave, sessionQuestionIds.length, sessionQuestionIds)
          if (xpResult) {
            setCompletionXp(xpResult)
            setUserLevel(xpResult.level)
            if (xpResult.leveledUp) setShowLevelUpModal(true)
            if (xpResult.milestoneToast) setMilestoneToast(xpResult.milestoneToast)
          }
          setMode("complete")
          setCompleted(true)
          setStoredTodayProgress({
            dayKey,
            score: scoreToSave,
            missedIds,
            completedCount: sessionQuestionIds.length,
          })
        }
        return
      }
      const nextId = sessionQuestionIds[questionIndex + 1]
      setCurrentQuestion(nextQuestion ?? (nextId ? getQuestionById(questionsRef.current, nextId) ?? null : null))

      const preloadId = sessionQuestionIds[questionIndex + 2]
      if (preloadId) {
        setNextQuestion(getQuestionById(questionsRef.current, preloadId) ?? null)
      } else {
        setNextQuestion(null)
      }

      setQuestionIndex((prev) => prev + 1)
      setSelected(null)
      if (!isReviewMode) {
        setStoredTodayProgress({
          dayKey,
          score: scoreToSave,
          missedIds,
          completedCount: newCompletedCount,
        })
      }
    },
    [questionIndex, sessionQuestionIds, sessionQuestionIds.length, isReviewMode, dayKey, score, missedIds, finishSession, nextQuestion]
  )

  useEffect(() => {
    let isMounted = true

    const fetchQuestions = async () => {
      setLoading(true)
      setLoadError(null)

      const hasEnv =
        typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
        process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
        typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

      if (!hasEnv) {
        if (!isMounted) return
        setLoadError("Supabase is not configured. Using offline questions.")
        setQuestions(localQuestions)
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from("questions")
          .select("id, article, difficulty, question, options, correct_index, explanation, code_reference")
          .order("id", { ascending: true })

        if (!isMounted) return

        if (error) {
          setLoadError("Could not load questions from server. Using offline questions.")
          setQuestions(localQuestions)
        } else {
          const rows = (data ?? []) as DbQuestionRow[]
          const mapped = rows.map(mapDbRowToQuestion).filter((q): q is Question => q != null)
          if (mapped.length === 0) {
            setLoadError("No questions in database. Using offline questions.")
            setQuestions(localQuestions)
          } else {
            setQuestions(mapped)
          }
        }
      } catch {
        if (!isMounted) return
        setLoadError("Could not load questions from server. Using offline questions.")
        setQuestions(localQuestions)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchQuestions()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!questions.length) {
      setInitialized(true)
      return
    }

    const key = getDayKey()
    const storedSession = getStoredSession()
    const progress = getStoredTodayProgress()

    const completedToday =
      progress?.dayKey === key &&
      storedSession?.dayKey === key &&
      Array.isArray(storedSession?.questionIds) &&
      progress.completedCount >= storedSession.questionIds.length

    if (completedToday) {
      setSessionQuestionIds(storedSession.questionIds)
      setScore(progress.score)
      setMissedIds(progress.missedIds)
      setMode("complete")
      setCompleted(true)
      setQuestionIndex(0)
      setSelected(null)
      setInitialized(true)
      return
    }

    if (!userLevelLoaded) return

    const allowedDifficulties = getQuestionFilterDifficulties(getDifficulty(userLevel))
    const filteredQuestions = questions.filter((q) => allowedDifficulties.includes(q.difficulty))
    const questionsToUse = filteredQuestions.length > 0 ? filteredQuestions : questions
    const difficultyBand = getDifficulty(userLevel)

    const expectedLength = Math.min(SESSION_SIZE, questions.length)
    const availableIdSet = new Set(questions.map((q) => q.id))

    if (!storedSession || storedSession.dayKey !== key) {
      try {
        localStorage.removeItem("practice_completed_today")
      } catch {}
      const questionIds = buildNewSession(key, questionsToUse)
      const sessionSignature = computeQuestionSetSignature(questionsToUse)
      levelAtSessionStartRef.current = getLevelFromXpProgression(getXp()).level
      startArticleMasteryRef.current = JSON.parse(JSON.stringify(getArticleMastery())) as ArticleMastery
      setStoredSession({ dayKey: key, questionIds, difficultyBand })
      setStoredSessionMeta({ dayKey: key, signature: sessionSignature, levelSnapshot: userLevel, difficultyTier: difficultyBand })
      setStoredTodayProgress({ dayKey: key, score: 0, missedIds: [], completedCount: 0 })
      setStoredQuestionSetMeta(sessionSignature)
      setSessionQuestionIds(questionIds)
      setQuestionIndex(0)
      setScore(0)
      setMissedIds([])
      setMode("quiz")
      setCompleted(false)
      setIsReviewMode(false)
      setReviewComplete(false)
      setSelected(null)
      setInitialized(true)
      return
    }

    const ids = storedSession.questionIds
    const uniqueIds = new Set(ids)
    const storedIdsValid =
      ids.length > 0 &&
      ids.length <= Math.min(SESSION_SIZE, questions.length) &&
      uniqueIds.size === ids.length &&
      ids.every((id) => availableIdSet.has(id))

    if (!storedIdsValid) {
      const questionIds = buildNewSession(key, questionsToUse)
      const sessionSignature = computeQuestionSetSignature(questionsToUse)
      levelAtSessionStartRef.current = getLevelFromXpProgression(getXp()).level
      startArticleMasteryRef.current = JSON.parse(JSON.stringify(getArticleMastery())) as ArticleMastery
      setStoredSession({ dayKey: key, questionIds, difficultyBand })
      setStoredSessionMeta({ dayKey: key, signature: sessionSignature, levelSnapshot: userLevel, difficultyTier: difficultyBand })
      setStoredTodayProgress({ dayKey: key, score: 0, missedIds: [], completedCount: 0 })
      setStoredQuestionSetMeta(sessionSignature)
      setSessionQuestionIds(questionIds)
      setQuestionIndex(0)
      setScore(0)
      setMissedIds([])
      setMode("quiz")
      setCompleted(false)
      setIsReviewMode(false)
      setReviewComplete(false)
      setSelected(null)
      setInitialized(true)
      return
    }

    setSessionQuestionIds(ids)
    setStoredQuestionSetMeta(computeQuestionSetSignature(questions))
    if (progress && progress.dayKey === key) {
      const safeCompleted = Math.min(progress.completedCount, ids.length)
      const isDone = safeCompleted >= ids.length
      setQuestionIndex(isDone ? 0 : safeCompleted)
      setCompleted(isDone)
      if (isDone) setMode("complete")
      setScore(progress.score)
      setMissedIds(progress.missedIds)
    } else {
      setStoredTodayProgress({ dayKey: key, score: 0, missedIds: [], completedCount: 0 })
      setQuestionIndex(0)
      setScore(0)
      setMissedIds([])
      setCompleted(false)
    }
    setSelected(null)
    setInitialized(true)
  }, [loading, questionsKey, userLevelLoaded])

  useEffect(() => {
    if (
      !initialized ||
      loading ||
      questions.length === 0 ||
      sessionQuestionIds.length === 0 ||
      question != null ||
      sessionRepairing ||
      mode === "complete" ||
      completed ||
      reviewComplete
    ) {
      return
    }
    const storedProgress = getStoredTodayProgress()
    const storedSession = getStoredSession()
    const key = getDayKey()
    const completedToday =
      storedProgress?.dayKey === key &&
      storedSession?.dayKey === key &&
      Array.isArray(storedSession?.questionIds) &&
      storedProgress.completedCount >= storedSession.questionIds.length
    if (completedToday) {
      return
    }
    sessionStartedLoggedRef.current = false
    setSessionRepairing(true)
    const allowedDifficulties = getQuestionFilterDifficulties(getDifficulty(userLevel))
    const filteredQuestions = questions.filter((q) => allowedDifficulties.includes(q.difficulty))
    const questionsToUse = filteredQuestions.length > 0 ? filteredQuestions : questions
    const questionIds = buildNewSession(key, questionsToUse)
    levelAtSessionStartRef.current = getLevelFromXpProgression(getXp()).level
    startArticleMasteryRef.current = JSON.parse(JSON.stringify(getArticleMastery())) as ArticleMastery
    const difficultyBand = getDifficulty(userLevel)
    const sessionSignature = computeQuestionSetSignature(questionsToUse)
    setStoredSession({ dayKey: key, questionIds, difficultyBand })
    setStoredSessionMeta({ dayKey: key, signature: sessionSignature, levelSnapshot: userLevel, difficultyTier: difficultyBand })
    setStoredTodayProgress({ dayKey: key, score: 0, missedIds: [], completedCount: 0 })
    setStoredQuestionSetMeta(sessionSignature)
    setSessionQuestionIds(questionIds)
    setQuestionIndex(0)
    setScore(0)
    setMissedIds([])
    setMode("quiz")
    setCompleted(false)
    setIsReviewMode(false)
    setReviewComplete(false)
    setSelected(null)
    const t = setTimeout(() => setSessionRepairing(false), 0)
    return () => clearTimeout(t)
  }, [initialized, loading, questionsKey, sessionQuestionIds.length, question, sessionRepairing, userLevel, mode, completed, reviewComplete])

  // Track session_start when quiz is ready
  useEffect(() => {
    if (
      !question ||
      sessionRepairing ||
      completed ||
      reviewComplete ||
      mode !== "quiz" ||
      sessionStartedLoggedRef.current ||
      !userRef.current
    )
      return
    sessionStartedLoggedRef.current = true
    try {
      trackBetaUsage(userRef.current, "session_start")
    } catch {
      /* fail silently */
    }
  }, [question, sessionRepairing, completed, reviewComplete, mode])

  const handleSelect = (index: number) => {
    if (hasSubmitted || !question) return
    if (selected !== index) {
      setSelected(index)
      return
    }
    const submittedQuestion = question
    const isCorrect = index === effectiveCorrectIndex
    const newMissed = !isCorrect && !missedIds.includes(submittedQuestion.id) ? [...missedIds, submittedQuestion.id] : missedIds

    // Optimistic UI: reveal feedback immediately.
    setSelected(index)
    setHasSubmitted(true)

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(isCorrect ? 50 : [30, 40, 30])
    }

    // Keep XP/stats/backend updates in the background so UI never waits on them.
    setTimeout(() => {
      try {
        if (!isReviewMode) {
          recordArticleAttemptProgression(submittedQuestion.article, isCorrect)
          const qId = parseInt(submittedQuestion.id, 10)
          if (!isNaN(qId)) {
            applyQuestionResult(qId, isCorrect).catch((error) => {
              console.error("[quiz] applyQuestionResult failed:", error)
            })
          }
          if (isCorrect) {
            removeFromWrongQueue(submittedQuestion.id)
          }
        }

        if (isCorrect) {
          setScore((prev) => prev + 1)
        } else {
          setMissedIds(newMissed)
          if (!isReviewMode) {
            addToWrongQueueCapped(submittedQuestion.id)
            setStoredTodayProgress({
              dayKey,
              score,
              missedIds: newMissed,
              completedCount: questionIndex + 1,
            })
          }
        }
      } catch (error) {
        console.error("[quiz] background submit updates failed:", error)
      }
    }, 0)
  }

  const handleNextQuestion = useCallback(() => {
    if (isQuestionTransitioning) return
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    setIsQuestionTransitioning(true)
    requestAnimationFrame(() => {
      void advanceToNext().then(() => {
        requestAnimationFrame(() => setIsQuestionTransitioning(false))
      })
    })
  }, [advanceToNext, isQuestionTransitioning])

  useEffect(() => {
    if (!hasSubmitted || !result || !question || mode === "complete" || completed || reviewComplete) return
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    const delayMs = result === "correct" ? 800 : 1500
    autoAdvanceTimerRef.current = setTimeout(() => {
      handleNextQuestion()
    }, delayMs)
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
        autoAdvanceTimerRef.current = null
      }
    }
  }, [hasSubmitted, result, question, mode, completed, reviewComplete, handleNextQuestion])

  const startReviewMissed = () => {
    if (missedIds.length === 0) return
    setSessionQuestionIds([...missedIds])
    setQuestionIndex(0)
    setScore(0)
    setMissedIds([])
    setSelected(null)
    setCompleted(false)
    setMode("review")
    setIsReviewMode(true)
    setReviewComplete(false)
  }

  const backToCompletion = () => {
    setMode("complete")
    setIsReviewMode(false)
    setReviewComplete(false)
    setSessionQuestionIds(getStoredSession()?.questionIds ?? [])
    const progress = getStoredTodayProgress()
    if (progress && progress.dayKey === dayKey) {
      setScore(progress.score)
      setMissedIds(progress.missedIds)
    }
    setQuestionIndex(0)
    setSelected(null)
    setCompleted(true)
  }

  const handleBackToDashboard = useCallback(() => {
    router.push("/dashboard")
  }, [router])

  const startOverToday = () => {
    sessionStartedLoggedRef.current = false
    const key = getDayKey()
    const allowedDifficulties = getQuestionFilterDifficulties(getDifficulty(userLevel))
    const filtered = questions.filter((q) => allowedDifficulties.includes(q.difficulty))
    const questionsToUse = filtered.length > 0 ? filtered : questions
    const questionIds = buildNewSession(key, questionsToUse)
    levelAtSessionStartRef.current = getLevelFromXpProgression(getXp()).level
    startArticleMasteryRef.current = JSON.parse(JSON.stringify(getArticleMastery())) as ArticleMastery
    const difficultyBand = getDifficulty(userLevel)
    const sessionSignature = computeQuestionSetSignature(questionsToUse)
    setStoredSession({ dayKey: key, questionIds, difficultyBand })
    setStoredSessionMeta({ dayKey: key, signature: sessionSignature, levelSnapshot: userLevel, difficultyTier: difficultyBand })
    setStoredTodayProgress({ dayKey: key, score: 0, missedIds: [], completedCount: 0 })
    setSessionQuestionIds(questionIds)
    setQuestionIndex(0)
    setScore(0)
    setMissedIds([])
    setMode("quiz")
    setCompleted(false)
    setCompletionXp(null)
    setShowLevelUpModal(false)
    setMilestoneToast(null)
    setSelected(null)
    setIsReviewMode(false)
    setReviewComplete(false)
  }

  const showDevTools = process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === "true"

  const testRls = async () => {
    if (!showDevTools) return
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    if (!user) return

    // PROFILES
    let p = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    if (!p.data) {
      const ins = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          streak: 0,
          last_completed_date: null,
        })
        .select("*")
        .single()
    }

    const upd = await supabase
      .from("profiles")
      .update({
        streak: 1,
        last_completed_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", user.id)
      .select("*")
      .single()

    // USER_STATS
    let s = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!s.data) {
      const insS = await supabase
        .from("user_stats")
        .insert({
          user_id: user.id,
          total_answered: 0,
          total_correct: 0,
        })
        .select("*")
        .single()
    }

    const updS = await supabase
      .from("user_stats")
      .update({
        total_answered: 1,
        total_correct: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("*")
      .single()
  }

  const testSupabaseButton = showDevTools ? (
    <button
      type="button"
      onClick={testRls}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#222",
        color: "#fff",
        zIndex: 9999,
      }}
    >
      Test Supabase
    </button>
  ) : null

  if (loading || !initialized || sessionQuestionIds.length === 0) {
    return (
      <>
        <main
          style={{
            minHeight: "100vh",
            background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Loading...</div>
        </main>
        {testSupabaseButton}
      </>
    )
  }

  if (mode === "complete") {
    const masteryDelta =
      startArticleMasteryRef.current != null
        ? computeArticleDelta(
            questions,
            sessionQuestionIds,
            startArticleMasteryRef.current,
            getArticleMastery()
          )
        : []
    const totalQuestions = sessionQuestionIds.length
    const perfectScore = isPerfectScore(score, totalQuestions)
    const streak = typeof completionStreak === "number" && Number.isFinite(completionStreak) ? completionStreak : null
    const streakTier = streak != null ? getStreakTier(streak) : "minimal"
    const milestoneMessage = streak != null ? getMilestoneMessage(streak) : null
    const showMilestoneGlow = streak != null && isMilestoneStreak(streak)
    const performanceLine = getPerformanceLine(score, totalQuestions)
    const articleImprovements = masteryDelta.filter((r) => r.deltaPct >= 0.1)

    return (
      <>
      {showLevelUpModal && completionXp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: 20,
          }}
          onClick={() => setShowLevelUpModal(false)}
        >
          <div
            className="level-up-banner"
            style={{
              background: "rgba(15,20,25,0.98)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              padding: 32,
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 8, letterSpacing: "0.05em" }}>
              Level Up
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
              Level {completionXp.level}
            </div>
            <div style={{ fontSize: 14, color: "var(--nec-blue)", marginBottom: 8, fontWeight: 600 }}>
              +{LEVEL_UP_BONUS} XP progress
            </div>
            {completionXp.levelUpUnlockText && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>
                Level {completionXp.level + 1}: {completionXp.levelUpUnlockText}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowLevelUpModal(false)}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                background: "white",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                border: "none",
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
      {milestoneToast && (
        <div
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "12px 20px",
            borderRadius: 12,
            background: "rgba(15,20,25,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 1050,
            fontSize: 14,
            color: "rgba(255,255,255,0.9)",
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          {milestoneToast}
        </div>
      )}
      <main
        className="nec-page-fade"
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <div style={{ width: "100%", maxWidth: 760 }}>
        <button
          type="button"
          onClick={handleBackToDashboard}
          className="nec-btn-secondary"
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
          {loadError && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 13,
              }}
            >
              {loadError}
            </div>
          )}
          <div
            className={`nec-page-fade ${showMilestoneGlow ? "milestone-card-glow" : ""}`}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: 32,
              boxShadow: "var(--nec-shadow-2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.03em" }}>Daily 5 Complete</div>
            {completionXp?.rankUp && completionXp?.newRankName && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nec-gold)", letterSpacing: "0.05em", marginBottom: 4 }}>
                  New Standing
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  {completionXp.newRankName}
                </div>
              </div>
            )}
            {!completionXp?.rankUp && (() => {
              const rankInfo = questions.length > 0 ? getRankInfo(questions, getArticleMastery()) : null
              const rankLabel = rankInfo?.current.label ?? "Apprentice"
              const division = rankInfo ? getDivisionFromProgress(rankInfo.progressToNext) : "Division III"
              const articlesToPromotion = rankInfo?.next ? Math.max(0, rankInfo.requiredForNext - rankInfo.reachedArticles) : null
              const nextRank = rankInfo?.next?.label
              return (
                <div style={{ marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  <div>Standing: <span style={{ color: "rgba(198,168,74,0.9)", fontWeight: 600 }}>{rankLabel} — {division}</span></div>
                  {articlesToPromotion != null && articlesToPromotion > 0 && nextRank && (
                    <div style={{ marginTop: 4 }}>{articlesToPromotion} article{articlesToPromotion !== 1 ? "s" : ""} to {nextRank}</div>
                  )}
                </div>
              )
            })()}
            <div className="nec-end-score" style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
              Score: {score}/{totalQuestions}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
              {performanceLine}
            </div>
            {completionXp != null && (
              <div className="nec-end-xp" style={{ fontSize: 16, color: "var(--nec-blue)", marginBottom: 8, fontWeight: 600 }}>
                +{animatedXpEarned} XP
              </div>
            )}
            {articleImprovements.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {articleImprovements.map((r) => (
                  <div
                    key={r.articleKey}
                    style={{
                      fontSize: 13,
                      color: "var(--nec-blue)",
                      fontWeight: 600,
                    }}
                  >
                    Article {r.articleKey} strengthened (+{Math.round(r.deltaPct * 100)}%)
                  </div>
                ))}
              </div>
            )}
            {completionXp != null && (
              <div className="nec-end-bar" style={{ marginBottom: 16 }}>
                <div
                  className={completionXp.leveledUp ? "nec-level-gold-flash" : undefined}
                  style={{
                    display: "inline-block",
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.9)",
                    marginBottom: completionXp.leveledUp ? 4 : 10,
                  }}
                >
                  Level {completionXp.level}
                </div>
                {completionXp.leveledUp && (
                  <div className="nec-level-up-text" style={{ fontSize: 12, color: "var(--nec-gold)", fontWeight: 600, marginBottom: 10 }}>
                    Level progress
                  </div>
                )}
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Progress to Level {completionXp.level + 1}
                </div>
                <div
                  style={{
                    height: 11,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                    maxWidth: 280,
                    margin: "0 auto",
                  }}
                >
                  <div
                    className="nec-xp-bar-fill"
                    style={{
                      height: "100%",
                      width: `${(() => {
                        const { xpInto, xpForNext } = getLevelFromXpProgression(completionXp.totalXP)
                        return xpForNext > 0 ? (xpInto / xpForNext) * 100 : 0
                      })()}%`,
                      borderRadius: 999,
                      background: "linear-gradient(90deg, var(--nec-blue) 0%, var(--nec-blue2) 100%)",
                      transition: "width 400ms ease-out",
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  {(() => {
                    const { xpInto, xpForNext } = getLevelFromXpProgression(completionXp.totalXP)
                    return `${xpInto} / ${xpForNext} · ${completionXp.totalXP} total XP`
                  })()}
                </div>
              </div>
            )}
            <div className="nec-end-streak" style={{ marginTop: 12, marginBottom: 16 }}>
              {perfectScore ? (
                <div>
                  <div
                    className="perfect-badge"
                    style={{
                      display: "inline-block",
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    Clean Run
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
                    Dialed in.
                  </div>
                </div>
              ) : (
                <div
                  className={`streak-badge streak-tier-${streakTier}`}
                  style={{
                    display: "inline-block",
                    padding: "10px 18px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.95)",
                  }}
                >
                  Consistency: {streak != null ? animatedStreak : "—"} Days
                </div>
              )}
              {milestoneMessage != null && (
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 10, lineHeight: 1.4 }}>
                  {milestoneMessage}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {missedIds.length > 0 && (
                <button
                  type="button"
                  onClick={startReviewMissed}
                  className="nec-btn-secondary"
                  style={{
                    padding: "12px 20px",
                    borderRadius: 12,
                    background: "transparent",
                    border: "1px solid var(--nec-border)",
                    color: "var(--nec-text)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Review Missed
                </button>
              )}
              <button
                type="button"
                onClick={startOverToday}
                className="nec-btn-primary"
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  background: "linear-gradient(180deg, rgba(59,130,255,0.15) 0%, var(--nec-blue) 30%, var(--nec-blue) 100%)",
                  border: "none",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "var(--nec-shadow-3)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
              >
                Start Over (Today)
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              background: "var(--nec-card)",
              border: "1px solid var(--nec-border)",
              borderRadius: 20,
              padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ fontSize: 14, color: "var(--nec-muted)", marginBottom: 14, fontWeight: 600 }}>
              Article Mastery (this round)
            </div>
            {masteryDelta.length === 0 ? (
              <div style={{ color: "var(--nec-muted2)", fontSize: 14, lineHeight: 1.4 }}>
                {startArticleMasteryRef.current == null
                  ? "No mastery data for this round."
                  : "No mastery progress this round."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {masteryDelta.map((row) => (
                  <div
                    key={row.articleKey}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--nec-text)" }}>{row.articleKey}</span>
                      <span style={{ fontSize: 13, color: "var(--nec-muted)", fontWeight: 600 }}>
                        {Math.round(row.beforePct * 100)}% → {Math.round(row.afterPct * 100)}%
                        {row.deltaPct > 0 ? ` (+${Math.round(row.deltaPct * 100)}%)` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--nec-muted2)" }}>
                      Progress: {Math.round(row.afterPct * 100)}% (Mastered: {row.masteredAfter}/{row.total})
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.round(row.afterPct * 100)}%`,
                          borderRadius: 999,
                          background: "var(--nec-blue)",
                          minWidth: row.afterPct > 0 ? 4 : 0,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "center",
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
            }}
          >
            <span>Based on 2023 NEC</span>
            <span>NEC Sharp — Training Build 0.1</span>
          </div>
        </div>
      </main>
        {testSupabaseButton}
      </>
    )
  }

  if (reviewComplete) {
    return (
      <>
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <div style={{ width: "100%", maxWidth: 760 }}>
        <button
          type="button"
          onClick={handleBackToDashboard}
          className="nec-btn-secondary"
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
          {loadError && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 13,
              }}
            >
              {loadError}
            </div>
          )}
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: 32,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Review complete</div>
            <button
              type="button"
              onClick={backToCompletion}
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </div>
      </main>
        {testSupabaseButton}
      </>
    )
  }

  if (!question || sessionRepairing) {
    return (
      <>
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <div style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
        <button
          type="button"
          onClick={handleBackToDashboard}
          className="nec-btn-secondary"
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            Syncing session…
            <div style={{ marginTop: 10, color: "rgba(255,255,255,0.5)", fontSize: 12, display: "none" }}>
            (Resetting today’s questions)
            </div>
          </div>
        </div>
      </main>
        {testSupabaseButton}
      </>
    )
  }

  return (
    <>
    <main
      className="nec-page-fade"
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: hasSubmitted
          ? "max(16px, env(safe-area-inset-top)) 16px calc(116px + env(safe-area-inset-bottom))"
          : "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>
        <button
          type="button"
          onClick={handleBackToDashboard}
          className="nec-btn-secondary"
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
        {loadError && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.3)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 13,
            }}
          >
            {loadError}
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>NEC Sharp</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.04em" }}>Daily Practice</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              Question {questionIndex + 1} of {sessionSize}
            </span>
            <span style={badgeStyle("rgba(255,255,255,0.06)", "rgba(255,255,255,0.85)")}>
              {question.article}
            </span>
            {(() => {
              const rankInfo = questions.length > 0 ? getRankInfo(questions, getArticleMastery()) : null
              const { level } = getLevelFromXpProgression(getXp())
              const rankLabel = rankInfo?.current.label ?? "Apprentice"
              const division = rankInfo ? getDivisionFromProgress(rankInfo.progressToNext) : "Division III"
              return (
                <>
                  <span style={{ ...badgeStyle("rgba(198,168,74,0.1)", "rgba(198,168,74,0.9)"), fontSize: 12, fontWeight: 600 }}>
                    {rankLabel}
                  </span>
                  <span style={{ ...badgeStyle("rgba(255,255,255,0.04)", "rgba(255,255,255,0.5)"), fontSize: 11, fontWeight: 500 }}>
                    {division}
                  </span>
                  <span style={{ ...badgeStyle("rgba(255,255,255,0.04)", "rgba(255,255,255,0.6)"), fontSize: 11, fontWeight: 500 }}>
                    Level {level}
                  </span>
                </>
              )
            })()}
          </div>
        </div>

        <div
          className={`nec-page-fade question-card ${isQuestionTransitioning ? "question-exit" : "question-enter-active"}`}
          style={{
            background: "var(--nec-card)",
            border: "1px solid var(--nec-border)",
            borderRadius: 20,
            padding: "20px 18px",
            boxShadow: "var(--nec-shadow-2)",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 10, letterSpacing: "0.05em" }}>
              Multiple Choice
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.02em" }}>{question.question}</div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {displayOptions.map((option, index) => {
              const isCorrect = index === effectiveCorrectIndex
              const isSelected = index === selected
              const showState = hasSubmitted
              const bg =
                showState && isCorrect
                  ? "rgba(34,197,94,0.12)"
                  : showState && isSelected && !isCorrect
                    ? "rgba(239,68,68,0.05)"
                    : !showState && isSelected
                      ? "rgba(30,107,255,0.12)"
                    : "rgba(255,255,255,0.03)"
              const border =
                showState && isCorrect
                  ? "2px solid rgba(34,197,94,0.7)"
                  : showState && isSelected && !isCorrect
                    ? "2px solid rgba(239,68,68,0.6)"
                    : !showState && isSelected
                      ? "2px solid var(--nec-blue)"
                    : "1px solid rgba(255,255,255,0.08)"
              const boxShadow =
                showState && isCorrect
                  ? "inset 0 1px 2px rgba(0,0,0,0.15)"
                  : showState && isSelected && !isCorrect
                    ? "inset 0 1px 2px rgba(0,0,0,0.2)"
                    : !showState && isSelected
                      ? "inset 0 1px 2px rgba(0,0,0,0.15)"
                    : "none"
              const color =
                (showState && (isCorrect || isSelected)) || (!showState && isSelected)
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(255,255,255,0.88)"
              const optionClasses = [
                showState && (isCorrect || isSelected) && "nec-option-press",
                showState && isSelected && !isCorrect && "nec-incorrect-pulse",
              ]
                .filter(Boolean)
                .join(" ")

              return (
                <button
                  key={index}
                  onClick={() => handleSelect(index)}
                  disabled={hasSubmitted}
                  className={optionClasses || undefined}
                  style={{
                    textAlign: "left",
                    padding: "16px 14px",
                    minHeight: 56,
                    borderRadius: 12,
                    background: bg,
                    border,
                    boxShadow,
                    color,
                    cursor: hasSubmitted ? "default" : "pointer",
                    transition: "all 150ms ease",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 800,
                      flex: "0 0 auto",
                      marginTop: 1,
                    }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span style={{ lineHeight: 1.4, fontSize: 17 }}>{option}</span>
                </button>
              )
            })}
          </div>

          {hasSubmitted && selected !== null && (
            <div
              className="nec-explain-fade"
              style={{
                marginTop: 20,
                padding: 14,
                borderRadius: 14,
                background:
                  result === "correct" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.05)",
                border:
                  result === "correct"
                    ? "1px solid rgba(34,197,94,0.4)"
                    : "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <div
                className="nec-label-slide"
                style={{
                  fontWeight: 800,
                  marginBottom: 8,
                  color: result === "correct" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.9)",
                }}
              >
                {result === "correct" ? "Correct" : "Not quite"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.5, fontSize: 15.5 }}>
                {question.explanation}
              </div>
              {question.code_reference && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.4,
                  }}
                >
                  Reference: {question.code_reference}
                </div>
              )}
              {result !== null && (
                <div
                  style={{
                    position: "fixed",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1200,
                    padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
                    background: "linear-gradient(180deg, rgba(11,18,32,0.15) 0%, rgba(11,18,32,0.92) 100%)",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    style={{
                      width: "100%",
                      maxWidth: 420,
                      margin: "0 auto",
                      padding: "14px 16px",
                      minHeight: 54,
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.9)",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "background 150ms ease-out, transform 150ms ease-out",
                    }}
                  >
                    Next Question →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "center",
            color: "rgba(255,255,255,0.45)",
            fontSize: 11,
          }}
        >
          <span>Based on 2023 NEC</span>
          <span>NEC Sharp — Training Build 0.1</span>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Send Feedback
          </button>
        </div>
        {DEBUG_SESSION && (
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            sig={computeQuestionSetSignature(questions)} q={questions.length} session={sessionQuestionIds.join(",")}
          </div>
        )}
      </div>
    </main>
    {feedbackOpen && userRef.current && (
      <FeedbackModal
        userId={userRef.current}
        onClose={() => setFeedbackOpen(false)}
      />
    )}
    {testSupabaseButton}
    </>
  )
}
