"use client";

import { useEffect, useRef, useState } from "react";

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

const MAINTENANCE_GRACE_DAYS = 7;

type ArticleForTotals = {
  mastery_pct: number;
  question_count: number;
  mastery_credits?: number;
  credits_required?: number;
  last_mastery_credit_at?: string | null;
};

function computeChapterTotals(articles: ArticleForTotals[]) {
  const sumRequired = articles.reduce((acc, a) => acc + (a.credits_required ?? a.question_count ?? 0), 0);
  const sumCredits = articles.reduce(
    (acc, a) =>
      acc +
      (a.mastery_credits ?? (a.question_count ?? 0) * ((a.mastery_pct ?? 0) / 100)),
    0
  );
  const pct = sumRequired > 0 ? Math.round((sumCredits / sumRequired) * 100) : 0;

  let latestCreditAt: Date | null = null;
  for (const a of articles) {
    const at = a.last_mastery_credit_at;
    if (at) {
      const d = new Date(at);
      if (!isNaN(d.getTime()) && (!latestCreditAt || d > latestCreditAt)) {
        latestCreditAt = d;
      }
    }
  }

  return { sumCredits, sumRequired, pct: clampPct(pct), latestCreditAt };
}

function isInMaintenance(pct: number, latestCreditAt: Date | null): boolean {
  if (pct <= 0 || pct >= 100 || !latestCreditAt) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAINTENANCE_GRACE_DAYS);
  return latestCreditAt < cutoff;
}

type ChapterStatus = "Complete" | "In Progress" | "Not Started" | "No Questions Yet" | "Maintenance";

function computeChapterStatus(
  pct: number,
  sumRequired: number,
  latestCreditAt: Date | null
): ChapterStatus {
  if (sumRequired === 0) return "No Questions Yet";
  if (pct >= 100) return "Complete";
  if (pct === 0) return "Not Started";
  if (isInMaintenance(pct, latestCreditAt)) return "Maintenance";
  return "In Progress";
}

function pickInitialOpenChapter(
  chapters: { chapter_number: number; articles: ArticleForTotals[] }[]
) {
  for (const ch of chapters) {
    const { sumRequired, pct, latestCreditAt } = computeChapterTotals(ch.articles);
    const status = computeChapterStatus(pct, sumRequired, latestCreditAt);
    if (sumRequired > 0 && status !== "Complete") return ch.chapter_number;
  }
  return chapters.length > 0 ? chapters[0].chapter_number : null;
}

function getStatusBadgeClass(status: ChapterStatus): string {
  const base = "text-[11px] px-2 py-0.5 rounded-full border border-white/10";
  switch (status) {
    case "Complete":
      return `${base} bg-white/15 text-white`;
    case "In Progress":
      return `${base} bg-white/10 text-white/85`;
    case "Not Started":
      return `${base} bg-white/5 text-white/70`;
    case "No Questions Yet":
      return `${base} bg-white/5 text-white/60`;
    case "Maintenance":
      return "text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300";
  }
}

type ArticleRow = {
  article: string;
  title: string;
  sort_order: number;
  mastery_pct: number;
  total_correct: number;
  total_answered: number;
  question_count: number;
  last_mastery_credit_at: string | null;
};

type ChapterGroup = {
  chapter_number: number;
  chapter_title: string;
  articles: ArticleRow[];
};

export function CodeCoverageChapters({ chapters }: { chapters: ChapterGroup[] }) {
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (chapters.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      setOpenChapter(pickInitialOpenChapter(chapters));
    }
  }, [chapters]);

  return (
    <div className="space-y-3">
      {chapters.map((ch) => {
        const isOpen = openChapter === ch.chapter_number;
        const { sumCredits, sumRequired, pct, latestCreditAt } = computeChapterTotals(ch.articles);
        const status = computeChapterStatus(pct, sumRequired, latestCreditAt);
        const hasQuestions = sumRequired > 0;

        return (
          <div
            key={ch.chapter_number}
            className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                setOpenChapter((prev) =>
                  prev === ch.chapter_number ? null : ch.chapter_number
                )
              }
              className="w-full text-left"
            >
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      Chapter {ch.chapter_number}: {ch.chapter_title}
                    </span>
                    <span className={getStatusBadgeClass(status)}>{status}</span>
                  </div>
                  <span className="text-white/70 shrink-0">{isOpen ? "▾" : "▸"}</span>
                </div>

                <div className="mt-2 text-xs text-white/70">
                  Progress: {pct}%
                  {hasQuestions && (
                    <> • Credits: {Math.round(sumCredits)}/{sumRequired}</>
                  )}
                </div>

                <div className="mt-2 h-2 rounded bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                {ch.articles.map((a) => {
                  const pct = a.question_count === 0 ? 0 : clampPct(a.mastery_pct);

                  return (
                    <div
                      key={a.article}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{a.article}</div>
                        <div className="text-xs text-white/60 truncate">
                          {a.title}
                        </div>
                      </div>

                      <div className="text-right text-xs text-white/80">
                        {a.question_count === 0 ? (
                          <div className="text-white/60">No Questions Yet</div>
                        ) : (
                          <>
                            <div>Progress: {pct}%</div>
                            {a.total_answered > 0 && (
                              <div className="text-white/60">
                                Accuracy: {a.total_correct}/{a.total_answered}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
