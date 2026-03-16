"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type QuestionRow = {
  id: number;
  article: string;
  question: string;
  code_reference: string | null;
};

const ADMIN_EMAILS = (
  typeof process.env.NEXT_PUBLIC_ADMIN_EMAILS === "string"
    ? process.env.NEXT_PUBLIC_ADMIN_EMAILS
    : ""
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [filterNullOnly, setFilterNullOnly] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  const fetchQuestions = useCallback(async () => {
    let query = supabase
      .from("questions")
      .select("id, article, question, code_reference")
      .order("id", { ascending: true });

    if (filterNullOnly) {
      query = query.is("code_reference", null);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch questions:", error);
      setQuestions([]);
      return;
    }
    const rows = (data ?? []) as QuestionRow[];
    setQuestions(rows);
    setEditValues(
      Object.fromEntries(rows.map((r) => [r.id, r.code_reference ?? ""]))
    );
  }, [filterNullOnly]);

  useEffect(() => {
    (async () => {
      let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"] | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        sessionData = data;
      } catch (error) {
        console.error("[admin] getSession failed:", error);
      }
      if (!sessionData?.session) {
        router.replace("/login");
        return;
      }
      if (!isAdmin(sessionData.session.user.email ?? undefined)) {
        router.replace("/dashboard");
        return;
      }
      setUser({ id: sessionData.session.user.id, email: sessionData.session.user.email ?? undefined });
      await fetchQuestions();
      setLoading(false);
    })();
  }, [router, fetchQuestions]);

  async function handleSave(id: number) {
    const value = editValues[id] ?? "";
    setSavingId(id);
    const { error } = await supabase
      .from("questions")
      .update({ code_reference: value.trim() || null })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      console.error("Failed to update:", error);
      return;
    }
    await fetchQuestions();
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
          color: "var(--nec-text)",
        }}
      >
        <div>Loading...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
        color: "var(--nec-text)",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <Link
            href="/dashboard"
            style={{
              color: "var(--nec-muted)",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Code Reference Backfill</h1>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
            cursor: "pointer",
            fontSize: 14,
            color: "var(--nec-muted)",
          }}
        >
          <input
            type="checkbox"
            checked={filterNullOnly}
            onChange={(e) => setFilterNullOnly(e.target.checked)}
          />
          Show only questions where code_reference is null
        </label>

        <div
          style={{
            background: "var(--nec-card)",
            border: "1px solid var(--nec-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--nec-border)" }}>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--nec-muted)", fontWeight: 600 }}>ID</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--nec-muted)", fontWeight: 600 }}>Article</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--nec-muted)", fontWeight: 600 }}>Question</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--nec-muted)", fontWeight: 600 }}>Code Reference</th>
                <th style={{ padding: "12px 14px", width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} style={{ borderBottom: "1px solid var(--nec-border)" }}>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--nec-muted2)" }}>{q.id}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, maxWidth: 120 }}>{q.article}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, maxWidth: 280, color: "var(--nec-text)" }}>
                    {q.question.length > 80 ? `${q.question.slice(0, 80)}…` : q.question}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <input
                      type="text"
                      value={editValues[q.id] ?? q.code_reference ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      onBlur={() => handleSave(q.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="e.g. 250.66"
                      style={{
                        width: "100%",
                        minWidth: 140,
                        padding: "8px 10px",
                        fontSize: 13,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid var(--nec-border)",
                        borderRadius: 8,
                        color: "var(--nec-text)",
                        outline: "none",
                      }}
                    />
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <button
                      type="button"
                      onClick={() => handleSave(q.id)}
                      disabled={savingId === q.id}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        background: "var(--nec-blue)",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        cursor: savingId === q.id ? "not-allowed" : "pointer",
                        opacity: savingId === q.id ? 0.6 : 1,
                      }}
                    >
                      {savingId === q.id ? "…" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {questions.length === 0 && (
          <div style={{ marginTop: 20, color: "var(--nec-muted)", fontSize: 14 }}>
            {filterNullOnly
              ? "No questions with null code_reference."
              : "No questions found."}
          </div>
        )}
      </div>
    </main>
  );
}
