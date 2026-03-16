"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ArticleMastery } from "@/lib/progression";
import { getArticleMastery, getLevelFromXp, getXp } from "@/lib/progression";
import { fetchActiveArticles } from "@/lib/articles";
import { getRankSummary, type RankSummary } from "@/lib/rankSummary";
import { getDisplayRank, getDivisionFromProgress } from "@/lib/rankEngine";
import { mapDbRowToQuestion, questions as localQuestions, type DbQuestionRow, type Question } from "@/data/questions";
import { getStoredWeeklyStats, getWeekKey, getLastWeekSummaryShown, setLastWeekSummaryShown } from "@/lib/weeklyStats";
import { getMyCrew, createCrew, joinCrew } from "@/lib/crew";
import { hasProAccess, type UserProStatus } from "@/lib/features";
import { trackBetaUsage } from "@/lib/betaUsage";
import { FeedbackModal } from "@/app/components/FeedbackModal";
import { CodeCoverageModalBody } from "@/app/components/CodeCoverageModalBody";
import { InstallPromptBanner } from "@/app/components/InstallPromptBanner";

const STREAK_MILESTONE = 5;
const TODAY_GOAL_QUESTIONS = 5;

function getFirstName(email: string | undefined, fallback: string): string {
  if (!email) return fallback;
  const beforeAt = email.split("@")[0];
  const firstPart = beforeAt.split(/[._-]/)[0];
  if (!firstPart) return fallback;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
}

const glassCard = {
  background: "var(--nec-card)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--nec-border)",
  borderRadius: 18,
  boxShadow: "var(--nec-shadow-1)",
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<{ streak: number; last_completed_date: string | null } | null>(null);
  const [userPro, setUserPro] = useState<UserProStatus | null>(null);
  const [rankSummary, setRankSummary] = useState<RankSummary | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeArticles, setActiveArticles] = useState<{ article: string; title: string | null }[]>([]);
  const [statsOpen, setStatsOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const [myCrew, setMyCrew] = useState<{ id: string; name: string; invite_code: string } | null>(null);
  const [crewInviteCode, setCrewInviteCode] = useState("");
  const [crewAction, setCrewAction] = useState<"idle" | "creating" | "joining">("idle");
  const [crewError, setCrewError] = useState<string | null>(null);
  const [weeklySummaryOpen, setWeeklySummaryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const hasEnv =
        typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
        process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
        typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;
      console.log("[dashboard-load] env present:", {
        supabaseUrlPresent: typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" && process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0,
        supabaseAnonKeyPresent: typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0,
      });

      try {
        let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"];
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error("[dashboard-load] getSession error:", error);
          }
          sessionData = data;
        } catch (error) {
          console.error("[dashboard-load] getSession failed:", error);
          throw error;
        }

        if (!sessionData.session) {
          router.replace("/login");
          return;
        }
        setUser({ id: sessionData.session.user.id, email: sessionData.session.user.email ?? undefined });

        let profileData:
          | {
              streak?: number;
              last_completed_date?: string | null;
              is_pro?: boolean;
            }
          | null = null;
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("streak, last_completed_date, is_pro")
            .eq("id", sessionData.session.user.id)
            .maybeSingle();
          if (error) {
            console.error("[dashboard-load] profiles query error:", error);
          }
          profileData = data as { streak?: number; last_completed_date?: string | null; is_pro?: boolean } | null;
        } catch (error) {
          console.error("[dashboard-load] profiles query failed:", error);
          throw error;
        }

        if (profileData) {
          const row = profileData as { streak?: number; last_completed_date?: string | null; is_pro?: boolean };
          setProfile({
            streak: row.streak ?? 0,
            last_completed_date: row.last_completed_date ?? null,
          });
          setUserPro({
            isPro: row.is_pro ?? true,
            proExpiresAt: null,
          });
        } else {
          setProfile({ streak: 0, last_completed_date: null });
          setUserPro({ isPro: true, proExpiresAt: null });
        }

        const rankSummaryData = await getRankSummary(sessionData.session.user.id);
        setRankSummary(rankSummaryData ?? null);

        const articlesData = await fetchActiveArticles();
        setActiveArticles(articlesData.map((a) => ({ article: a.article, title: a.title })));

        if (hasEnv) {
          try {
            const { data: qData, error } = await supabase
              .from("questions")
              .select("id, article, difficulty, question, options, correct_index, explanation, code_reference")
              .order("id", { ascending: true });
            if (error) {
              console.error("[dashboard-load] questions query error:", error);
            }
            const rows = (qData ?? []) as DbQuestionRow[];
            const mapped = rows.map(mapDbRowToQuestion).filter((q): q is Question => q != null);
            setQuestions(mapped.length > 0 ? mapped : localQuestions);
          } catch (error) {
            console.error("[dashboard-load] questions query failed:", error);
            throw error;
          }
        } else {
          setQuestions(localQuestions);
        }
      } catch (error) {
        console.error("[dashboard-load] init sequence failed:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Track app open (fail silently)
  useEffect(() => {
    if (loading || !user?.id) return;
    trackBetaUsage(user.id, "app_open");
  }, [loading, user?.id]);

  const xp = getXp();
  const { level, xpInto, xpForNext } = getLevelFromXp(xp);
  const mastery = getArticleMastery();

  useEffect(() => {
    if (!user?.id || loading || !hasProAccess(userPro)) return;
    getMyCrew(user.id).then(setMyCrew).catch(() => setMyCrew(null));
  }, [user?.id, loading, crewAction, userPro]);

  // Show weekly summary modal when week has reset and user hasn't seen it (from localStorage)
  useEffect(() => {
    if (loading) return;
    const currentWeek = getWeekKey();
    const lastShown = getLastWeekSummaryShown();
    if (lastShown === currentWeek) return;

    const stored = getStoredWeeklyStats();
    const hasLastWeekData = stored && stored.weekKey !== currentWeek && stored.sessionsCompleted > 0;

    if (hasLastWeekData) {
      setWeeklySummaryOpen(true);
      setLastWeekSummaryShown(currentWeek);
    }
  }, [loading]);

  const streak = profile?.streak ?? 0;
  const firstName = getFirstName(user?.email, "Electrician");
  const currentRank = rankSummary?.currentRankName ?? "Novice";
  const nextRankName = rankSummary?.nextRankName ?? null;
  const progressToNextRank = rankSummary?.progressToNext ?? 0;
  const division = getDivisionFromProgress(progressToNextRank);
  const articlesToPromotion = rankSummary?.nextRankName
    ? Math.max(0, rankSummary.requiredArticlesForNextRank - rankSummary.qualifiedArticlesForNextRank)
    : null;
  const xpToNextLevel = xpForNext - xpInto;
  const closeToLevelUp = xpToNextLevel <= 20;
  const milestoneTomorrow = streak === STREAK_MILESTONE - 1 && streak > 0;

  // Weekly stats from localStorage (DB weekly fields removed until weekly_stats table exists)
  const currentWeek = getWeekKey();
  const storedWeekly = getStoredWeeklyStats();
  const storedWeekMatches = storedWeekly?.weekKey === currentWeek;
  const weeklySessions = storedWeekMatches ? (storedWeekly?.sessionsCompleted ?? 0) : 0;
  const weeklyCorrect = storedWeekMatches ? (storedWeekly?.totalCorrect ?? 0) : 0;
  const weeklyAnswered = storedWeekMatches ? (storedWeekly?.totalAnswered ?? 0) : 0;
  const weeklyArticles = storedWeekMatches ? (storedWeekly?.articlesImproved ?? 0) : 0;
  const weeklyPpi = 0;
  const weeklyAccuracy = weeklyAnswered > 0 ? (weeklyCorrect / weeklyAnswered) * 100 : 0;
  const hasWeeklyActivity = weeklySessions > 0 || weeklyAnswered > 0;

  // Missed yesterday: last_completed_date exists but is before yesterday
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const lastCompleted = profile?.last_completed_date ?? null;
  const missedYesterday = lastCompleted != null && lastCompleted < yesterday;

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  function handleStartPractice() {
    router.push("/");
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
          color: "var(--nec-text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <div style={{ color: "var(--nec-muted)", fontSize: 14 }}>Loading...</div>
      </main>
    );
  }

  return (
    <main
      className="nec-page-fade"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 20px 48px",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Header: identity + positioning */}
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 6,
            letterSpacing: "-0.04em",
            textAlign: "center",
            color: "var(--nec-text)",
          }}
        >
          {firstName}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--nec-muted)",
            textAlign: "center",
            marginBottom: 32,
            lineHeight: 1.4,
          }}
        >
          Stay sharp. Stay dangerous.
        </p>

        {/* 1. Hero Progression Card — combined XP + Streak (Level 2) */}
        <div
          className="dashboard-card"
          style={{
            ...glassCard,
            boxShadow: "var(--nec-shadow-2)",
            padding: 28,
            marginBottom: 24,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "rgba(198,168,74,0.9)" }}>
              {currentRank}
            </div>
            <div style={{ fontSize: 12, color: "var(--nec-muted)", marginTop: 4 }}>
              {division} · Level {level}
            </div>
          </div>

          {nextRankName && (
            <div style={{ fontSize: 13, color: "var(--nec-muted)", marginBottom: 8 }}>
              {Math.round(progressToNextRank * 100)}% to {nextRankName}
            </div>
          )}

          <div style={{ fontSize: 15, color: "var(--nec-muted)", marginBottom: 8 }}>
            {xpInto} / {xpForNext} XP
          </div>
          <div
            style={{
              height: 14,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              marginBottom: 10,
              boxShadow: undefined,
              border: undefined,
            }}
          >
            <div
              className="nec-xp-bar-fill"
              style={{
                height: "100%",
                width: `${xpForNext > 0 ? (xpInto / xpForNext) * 100 : 0}%`,
                borderRadius: 999,
                background: "linear-gradient(90deg, var(--nec-blue) 0%, var(--nec-blue2) 100%)",
                transition: "width 0.4s ease-out",
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: "var(--nec-muted2)", marginBottom: 20 }}>
            {xpToNextLevel > 0 ? `${xpToNextLevel} XP to next level` : "Level complete"}
            {closeToLevelUp && xpToNextLevel > 0 && (
              <span style={{ marginLeft: 8, color: "var(--nec-muted)", fontWeight: 500 }}>· Closing In</span>
            )}
          </div>

          <div
            style={{
              paddingTop: 16,
              borderTop: "1px solid var(--nec-border)",
              fontSize: 14,
              color: "var(--nec-muted)",
            }}
          >
            Consistency: {streak} Days
            {streak < STREAK_MILESTONE && (
              <span style={{ marginLeft: 8, color: "var(--nec-muted2)", fontSize: 13 }}>
                · Next target: {STREAK_MILESTONE} days
              </span>
            )}
            {milestoneTomorrow && (
              <span style={{ marginLeft: 8, color: "var(--nec-muted)", fontWeight: 500, fontSize: 13 }}>
                · Target tomorrow
              </span>
            )}
          </div>
        </div>

        {/* Missed yesterday reminder */}
        {missedYesterday && (
          <div
            style={{
              ...glassCard,
              padding: 14,
              marginBottom: 24,
              borderLeft: "4px solid var(--nec-muted)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>
              Missed yesterday. Back at it.
            </div>
          </div>
        )}

        {/* 2. Today's Mission */}
        <div
          style={{
            ...glassCard,
            padding: 24,
            marginBottom: 24,
            borderLeft: "4px solid var(--nec-blue)",
            background: "linear-gradient(135deg, rgba(30,107,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--nec-blue)", marginBottom: 12, letterSpacing: "0.1em", marginTop: 0 }}>
            TODAY&apos;S MISSION
          </h3>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: "var(--nec-text)" }}>
            Answer {TODAY_GOAL_QUESTIONS} Questions
          </div>
          <div style={{ fontSize: 13, color: "var(--nec-muted)", marginBottom: 8 }}>
            Five minutes. Stay sharp.
          </div>
          <div style={{ fontSize: 12, color: "var(--nec-muted2)", marginBottom: 10 }}>
            Clean run: +20 XP progress.
          </div>
          <div style={{ fontSize: 12, color: "var(--nec-muted2)", lineHeight: 1.5 }}>
            Consistent practice improves inspection speed and troubleshooting confidence.
          </div>
        </div>

        {/* 3. Your Standing */}
        {rankSummary && (
          <div
            style={{
              ...glassCard,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nec-muted)", marginBottom: 10, letterSpacing: "0.05em" }}>
              YOUR STANDING
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <div>
                Rank: <span style={{ color: "rgba(198,168,74,0.9)", fontWeight: 600 }}>{currentRank} — {division}</span>
              </div>
              {nextRankName && (
                <div style={{
                  color: (articlesToPromotion != null && articlesToPromotion <= 2) || progressToNextRank >= 0.9
                    ? "rgba(198,168,74,0.9)"
                    : "var(--nec-muted2)",
                  fontWeight: (articlesToPromotion != null && articlesToPromotion <= 2) || progressToNextRank >= 0.9 ? 600 : 400,
                }}>
                  {articlesToPromotion != null && articlesToPromotion > 0
                    ? `${articlesToPromotion} article${articlesToPromotion !== 1 ? "s" : ""} to ${nextRankName}`
                    : "Within reach"}
                </div>
              )}
              <div style={{ color: "var(--nec-muted2)" }}>
                Next Rank: {rankSummary.nextRankName
                  ? `${rankSummary.coveragePctForNextRank}% coverage @ ${rankSummary.perArticleThresholdForNextRank}% mastery`
                  : "—"}
              </div>
            </div>
          </div>
        )}

        {/* 4. This Week — Sessions, Accuracy, Articles, PPI */}
        {hasWeeklyActivity && (
          <div
            style={{
              ...glassCard,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              onClick={() => setWeeklyOpen(!weeklyOpen)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "none",
                border: "none",
                color: "var(--nec-text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>This Week</span>
              <span style={{ color: "var(--nec-muted)", fontSize: 12 }}>{weeklyOpen ? "−" : "+"}</span>
            </button>
            {weeklyOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--nec-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>
                  Sessions: {weeklySessions}
                </div>
                <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>
                  Accuracy: {weeklyAnswered > 0 ? `${Math.round(weeklyAccuracy)}%` : "—"}
                </div>
                <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>
                  Articles Improved: {weeklyArticles}
                </div>
                <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>
                  Performance Index: {weeklyPpi > 0 ? weeklyPpi : "—"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Crew (Pro) — collapsed by default */}
        {hasProAccess(userPro) && (
        <div
          style={{
            ...glassCard,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setCrewOpen(!crewOpen)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "none",
              border: "none",
              color: "var(--nec-muted)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span>Crew — optional. Compare if you want.</span>
            <span style={{ color: "var(--nec-muted2)", fontSize: 11 }}>{crewOpen ? "−" : "+"}</span>
          </button>
          {crewOpen && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--nec-border)" }}>
              {myCrew ? (
                <div style={{ fontSize: 13, color: "var(--nec-muted2)" }}>
                  <div>{myCrew.name}</div>
                  <div style={{ marginTop: 4, fontSize: 11 }}>Invite: {myCrew.invite_code}</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    disabled={crewAction !== "idle"}
                    onClick={async () => {
                      if (!user?.id) return;
                      setCrewAction("creating");
                      setCrewError(null);
                      const result = await createCrew(user.id, "My Crew");
                      setCrewAction("idle");
                      if (result) {
                        setMyCrew(result.crew);
                      } else {
                        setCrewError("Could not create crew");
                      }
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(30,107,255,0.15)",
                      border: "1px solid var(--nec-border2)",
                      color: "var(--nec-blue2)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: crewAction === "idle" ? "pointer" : "not-allowed",
                    }}
                  >
                    {crewAction === "creating" ? "Creating…" : "Create Crew"}
                  </button>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Invite code"
                      value={crewInviteCode}
                      onChange={(e) => setCrewInviteCode(e.target.value.toUpperCase().slice(0, 6))}
                      maxLength={6}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid var(--nec-border)",
                        color: "white",
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="button"
                      disabled={crewAction !== "idle" || crewInviteCode.length < 6}
                      onClick={async () => {
                        if (!user?.id) return;
                        setCrewAction("joining");
                        setCrewError(null);
                        const { success, error } = await joinCrew(user.id, crewInviteCode);
                        setCrewAction("idle");
                        if (success) {
                          getMyCrew(user.id).then(setMyCrew);
                          setCrewInviteCode("");
                        } else {
                          setCrewError(error ?? "Could not join");
                        }
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "transparent",
                        border: "1px solid var(--nec-border)",
                        color: "var(--nec-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: crewAction === "idle" && crewInviteCode.length >= 6 ? "pointer" : "not-allowed",
                      }}
                    >
                      Join
                    </button>
                  </div>
                  {crewError && <div style={{ fontSize: 11, color: "var(--nec-danger)" }}>{crewError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* 6. Primary Action Button */}
        <button
          type="button"
          onClick={handleStartPractice}
          className="dashboard-start-btn"
          style={{
            width: "100%",
            padding: 20,
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(59,130,255,0.15) 0%, var(--nec-blue) 30%, var(--nec-blue) 100%)",
            color: "white",
            fontWeight: 700,
            fontSize: 20,
            cursor: "pointer",
            border: "none",
            boxShadow: "var(--nec-shadow-3)",
            marginBottom: 20,
          }}
        >
          Start Practice
        </button>

        {/* 7. Secondary navigation */}
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          style={{
            width: "100%",
            padding: 14,
            background: "transparent",
            border: "none",
            color: "var(--nec-muted2)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "center",
            transition: "color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
        >
          Code Coverage →
        </button>
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, color: "var(--nec-muted2)", textAlign: "center", marginBottom: 12 }}>
            Five questions a day. Stay sharp.
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <span
              className="beta-feedback-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                color: "#60a5fa",
                background: "rgba(96,165,250,0.08)",
                border: "1px solid rgba(96,165,250,0.35)",
                letterSpacing: "0.02em",
              }}
            >
              ⚡ Early Access — Tell me what to fix
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            style={{
              width: "100%",
              padding: 10,
              background: "none",
              border: "none",
              color: "var(--nec-muted2)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            Send Feedback
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--nec-border)",
              color: "var(--nec-muted2)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
          <InstallPromptBanner />
        </div>
      </div>

      {statsOpen && rankSummary && user && (
        <StatsModal
          userId={user.id}
          rankSummary={rankSummary}
          currentRank={currentRank}
          mastery={mastery}
          xp={xp}
          level={level}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {weeklySummaryOpen && storedWeekly && storedWeekly.weekKey !== currentWeek && (
        <WeeklySummaryModal
          accuracy={
            (storedWeekly.totalAnswered ?? 0) > 0
              ? Math.round(((storedWeekly.totalCorrect ?? 0) / (storedWeekly.totalAnswered ?? 1)) * 100)
              : 0
          }
          sessions={storedWeekly.sessionsCompleted ?? 0}
          articlesImproved={storedWeekly.articlesImproved ?? 0}
          rankPosition={undefined}
          leaderboardEnabled={hasProAccess(userPro)}
          onClose={() => setWeeklySummaryOpen(false)}
        />
      )}

      {feedbackOpen && user && (
        <FeedbackModal userId={user.id} onClose={() => setFeedbackOpen(false)} />
      )}
    </main>
  );
}

function StatsModal({
  userId,
  rankSummary,
  currentRank,
  mastery,
  xp,
  level,
  onClose,
}: {
  userId: string;
  rankSummary: RankSummary;
  currentRank: string;
  mastery: ArticleMastery;
  xp: number;
  level: number;
  onClose: () => void;
}) {
  const { totalArticles, reachedArticles, coveragePct, progressToNext, ranksBreakdown, nextRankName } = rankSummary;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
        background: "var(--nec-card2)",
        border: "1px solid var(--nec-border)",
          borderRadius: 20,
          padding: 24,
          maxWidth: 520,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Code Coverage</h2>
            <div style={{ fontSize: 12, color: "var(--nec-muted)", marginTop: 4 }}>Track mastery across articles.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--nec-card)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "var(--nec-text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "var(--nec-muted)", marginBottom: 6 }}>Rank</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(198,168,74,0.9)" }}>{currentRank} — {getDivisionFromProgress(progressToNext)}</div>
          {nextRankName && (
            <div style={{ fontSize: 13, color: "var(--nec-muted)", marginTop: 4 }}>
              {Math.round(progressToNext * 100)}% to {nextRankName}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--nec-muted)", marginTop: 4 }}>
            Coverage: {Math.round(coveragePct)}% ({reachedArticles} / {totalArticles} articles)
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Level & XP</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--nec-blue)" }}>Level {level}</div>
          <div style={{ fontSize: 13, color: "var(--nec-muted)", marginTop: 4 }}>{xp} total XP</div>
        </div>

        <div style={{ marginTop: 20, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "var(--nec-muted2)", marginBottom: 8 }}>Next Rank</div>
          {ranksBreakdown.map((r) => {
            const statusColor = r.status === "On Track" ? "var(--nec-blue)" : "var(--nec-muted)";
            return (
              <div key={r.rankName} style={{ fontSize: 12, color: "var(--nec-muted)", marginBottom: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.rankName}</div>
                <div>Coverage: {r.coveragePct}% ({r.requiredArticles} / {totalArticles} articles) · Per-article: {r.perArticleThreshold}%</div>
                <div style={{ color: statusColor, fontSize: 11, marginTop: 2 }}>Status: {r.status}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginBottom: 8 }}>
            By Chapter
          </div>
          <CodeCoverageModalBody userId={userId} />
        </div>
      </div>
    </div>
  );
}

function WeeklySummaryModal({
  accuracy,
  sessions,
  articlesImproved,
  rankPosition,
  leaderboardEnabled,
  onClose,
}: {
  accuracy: number;
  sessions: number;
  articlesImproved: number;
  rankPosition?: number;
  leaderboardEnabled: boolean;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--nec-card2)",
          border: "1px solid var(--nec-border)",
          borderRadius: 18,
          padding: 24,
          maxWidth: 360,
          width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nec-muted)", marginBottom: 16, letterSpacing: "0.05em" }}>
          Last Week
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "var(--nec-text)" }}>
            Accuracy: {accuracy}%
          </div>
          <div style={{ fontSize: 14, color: "var(--nec-text)" }}>
            Sessions: {sessions}
          </div>
          <div style={{ fontSize: 14, color: "var(--nec-text)" }}>
            Articles Improved: {articlesImproved}
          </div>
          {leaderboardEnabled && rankPosition != null && (
            <div style={{ fontSize: 14, color: "var(--nec-text)" }}>
              Rank Position: #{rankPosition}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 10,
            background: "var(--nec-card)",
            border: "1px solid var(--nec-border)",
            color: "var(--nec-text)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

