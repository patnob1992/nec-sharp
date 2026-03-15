"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchChaptersAndArticles } from "@/lib/chapters";
import { CodeCoverageChapters } from "@/app/components/CodeCoverageChapters";

type ChapterGroup = {
  chapter_number: number;
  chapter_title: string;
  articles: {
    article: string;
    title: string;
    sort_order: number;
    mastery_pct: number;
    total_correct: number;
    total_answered: number;
    question_count: number;
    last_mastery_credit_at: string | null;
  }[];
};

const CHAPTER_TITLES: Record<number, string> = {
  0: "Introduction",
  1: "General",
  2: "Wiring and Protection",
  3: "Wiring Methods and Materials",
  4: "Equipment for General Use",
  5: "Specific Occupancies and Locations",
  6: "Specific Equipment",
  7: "Specific Conditions and Systems",
  8: "Communications Systems",
};

export function CodeCoverageModalBody({ userId }: { userId: string }) {
  const [articles, setArticles] = useState<
    {
      article: string;
      title: string | null;
      sort_order: number;
      chapter_number: number | null;
    }[]
  >([]);
  const [mastery, setMastery] = useState<
    Record<
      string,
      {
        mastery_pct: number;
        total_answered: number;
        total_correct: number;
        last_mastery_credit_at: string | null;
      }
    >
  >({});
  const [questionCountByArticle, setQuestionCountByArticle] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { articles: art } = await fetchChaptersAndArticles();
      setArticles(art);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      let { data, error } = await supabase
        .from("article_mastery")
        .select("article, mastery_pct, total_answered, total_correct, last_mastery_credit_at")
        .eq("user_id", userId);
      if (error?.code === "42703") {
        const fallback = await supabase
          .from("article_mastery")
          .select("article, mastery_pct, total_answered, total_correct")
          .eq("user_id", userId);
        data = (fallback.data ?? []).map((row) => ({ ...row, last_mastery_credit_at: null }));
      }
      const map: Record<
        string,
        {
          mastery_pct: number;
          total_answered: number;
          total_correct: number;
          last_mastery_credit_at: string | null;
        }
      > = {};
      for (const row of data ?? []) {
        const r = row as {
          article?: string;
          mastery_pct?: number;
          total_answered?: number;
          total_correct?: number;
          last_mastery_credit_at?: string | null;
        };
        if (r.article != null) {
          map[r.article] = {
            mastery_pct: r.mastery_pct ?? 0,
            total_answered: r.total_answered ?? 0,
            total_correct: r.total_correct ?? 0,
            last_mastery_credit_at: r.last_mastery_credit_at ?? null,
          };
        }
      }
      setMastery(map);
    })();
  }, [userId]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("question_counts_by_article")
        .select("article, question_count");
      if (error) {
        console.error("Failed to load question counts", error);
        return;
      }
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const r = row as { article?: string | null; question_count?: number | null };
        if (r.article) {
          counts[r.article] = r.question_count ?? 0;
        }
      }
      setQuestionCountByArticle(counts);
    })();
  }, []);

  const chaptersGrouped: ChapterGroup[] = useMemo(() => {
    const map = new Map<
      number,
      {
        article: string;
        title: string;
        sort_order: number;
        mastery_pct: number;
        total_correct: number;
        total_answered: number;
        question_count: number;
        last_mastery_credit_at: string | null;
      }[]
    >();

    for (const a of articles) {
      const cn = a.chapter_number ?? 0;
      const m = mastery[a.article];
      const qCount = questionCountByArticle[a.article] ?? 0;
      const masteryPct = m?.mastery_pct ?? 0;
      const totalCorrect = m?.total_correct ?? 0;
      const totalAnswered = m?.total_answered ?? 0;
      const lastCreditAt = m?.last_mastery_credit_at ?? null;

      if (!map.has(cn)) map.set(cn, []);
      map.get(cn)!.push({
        article: a.article,
        title: a.title ?? "",
        sort_order: a.sort_order,
        mastery_pct: qCount === 0 ? 0 : masteryPct,
        total_correct: totalCorrect,
        total_answered: totalAnswered,
        question_count: qCount,
        last_mastery_credit_at: lastCreditAt,
      });
    }

    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chapter_number, list]) => ({
        chapter_number,
        chapter_title: CHAPTER_TITLES[chapter_number] ?? "Other",
        articles: list.sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)),
      }));
  }, [articles, mastery, questionCountByArticle]);

  return (
    <div style={{ marginTop: 12 }}>
      <CodeCoverageChapters chapters={chaptersGrouped} />
    </div>
  );
}
