/**
 * Chapters + Articles for Code Coverage UI.
 */

import { supabase } from "./supabase";

export type ChapterRow = {
  chapter_number: number;
  title: string;
  sort_order: number;
};

export type ArticleRow = {
  article: string;
  title: string | null;
  sort_order: number;
  chapter_number: number | null;
};

export async function fetchChaptersAndArticles(): Promise<{
  chapters: ChapterRow[];
  articles: ArticleRow[];
}> {
  try {
    let chapters: ChapterRow[] = [];
    const { data: chData, error: chErr } = await supabase
      .from("chapters")
      .select("chapter_number, title, sort_order")
      .order("sort_order");
    if (!chErr) chapters = (chData ?? []) as ChapterRow[];

    let articles: ArticleRow[] = [];
    const { data: artData, error: aErr } = await supabase
      .from("articles")
      .select("article, title, sort_order, chapter_number")
      .eq("is_active", true)
      .order("sort_order");

    if (aErr?.code === "42703") {
      const r = await supabase
        .from("articles")
        .select("article, title, sort_order")
        .eq("active", true)
        .order("sort_order");
      articles = (r.data ?? []).map((a) => ({ ...a, chapter_number: null as number | null })) as ArticleRow[];
    } else if (!aErr && artData) {
      articles = artData.map((a) => ({
        ...a,
        chapter_number: (a as { chapter_number?: number }).chapter_number ?? null,
      })) as ArticleRow[];
    }

    return { chapters, articles };
  } catch {
    return { chapters: [], articles: [] };
  }
}
