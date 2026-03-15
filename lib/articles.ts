/**
 * Canonical article list from public.articles.
 * Single source of truth for coverage denominator.
 */

import { supabase } from "./supabase";

export type ArticleRow = {
  id: number;
  article: string;
  title: string | null;
  sort_order: number;
  active: boolean;
};

/** Fetch active articles ordered by sort_order. Uses is_active; falls back to active if column missing. */
export async function fetchActiveArticleKeys(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error?.code === "42703") {
      const r = await supabase.from("articles").select("*").eq("active", true).order("sort_order", { ascending: true });
      const d = r.data;
      if (!d || d.length === 0) return [];
      return (d as { article: string }[]).map((x) => x.article);
    }
    if (!data || data.length === 0) return [];
    return (data as { article: string }[]).map((r) => r.article);
  } catch {
    return [];
  }
}

/** Fetch full article rows for UI display. Uses is_active; falls back to active if column missing. */
export async function fetchActiveArticles(): Promise<ArticleRow[]> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error?.code === "42703") {
      const r = await supabase.from("articles").select("*").eq("active", true).order("sort_order", { ascending: true });
      return (r.data ?? []) as ArticleRow[];
    }
    return (data ?? []) as ArticleRow[];
  } catch {
    return [];
  }
}
