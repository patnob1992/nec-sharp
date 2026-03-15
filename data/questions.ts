export type Difficulty = "Green" | "Novice" | "Apprentice" | "Journeyman" | "Master";

export type Question = {
  id: string;
  article: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  code_reference: string | null;
};

// This matches the column names coming FROM Supabase (snake_case)
export type DbQuestionRow = {
  id: number;
  article: string;
  difficulty: string;
  question: string;
  options: unknown; // jsonb or string depending on how it's stored
  correct_index: number; // <-- IMPORTANT
  explanation: string;
  code_reference: string | null;
};

function toStringArrayOptions(value: unknown): string[] {
  // jsonb array already
  if (Array.isArray(value)) return value.map(String);

  // jsonb object (not expected) -> empty
  if (value && typeof value === "object") return [];

  // string that might be JSON
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
      return [];
    } catch {
      // if someone stored options as a plain comma string, you could split,
      // but safest is return [] so you see the issue clearly
      return [];
    }
  }

  return [];
}

function toDifficulty(value: string): Difficulty {
  // Normalize DB values safely
  const v = (value ?? "").trim();

  if (v === "Green") return "Green";
  if (v === "Novice") return "Novice";
  if (v === "Apprentice") return "Apprentice";
  if (v === "Journeyman") return "Journeyman";
  if (v === "Master") return "Master";

  // fallback
  return "Novice";
}

/**
 * Normalize correct_index to 0-based. Supabase may store 1-based (1=first, 2=second)
 * or 0-based (0=first, 1=second). When correct_index=1 is stored 1-based (meaning A),
 * using it as 0-based index 1 marks B as correct — hence "B always correct" bug.
 */
function normalizeCorrectIndex(raw: number, optionsLength: number): number | null {
  if (!Number.isFinite(raw) || optionsLength === 0) return null;
  // raw=0 → 0-based (first option)
  // raw in [1..N] → treat as 1-based, convert to 0-based
  const correctIndex = raw >= 1 && raw <= optionsLength ? raw - 1 : raw;
  if (correctIndex < 0 || correctIndex >= optionsLength) return null;
  return correctIndex;
}

export function mapDbRowToQuestion(row: DbQuestionRow): Question | null {
  try {
    const options = toStringArrayOptions(row.options);

    if (!row.article || !row.question) return null;
    if (!Number.isFinite(row.correct_index)) return null;

    const correctIndex = normalizeCorrectIndex(row.correct_index, options.length);
    if (correctIndex === null) {
      console.warn(
        "[mapDbRowToQuestion] Dropping invalid question: correct_index out of range",
        { id: row.id, correct_index: row.correct_index, optionsLength: options.length }
      );
      return null;
    }

    return {
      id: String(row.id),
      article: row.article,
      difficulty: toDifficulty(row.difficulty),
      question: row.question,
      options,
      correctIndex,
      explanation: row.explanation ?? "",
      code_reference: row.code_reference ?? null,
    };
  } catch (e) {
    console.error("mapDbRowToQuestion failed:", e, row);
    return null;
  }
}

// Keep your offline questions exactly as you have them:
export const questions: Question[] = [
  {
    id: "q1",
    article: "250 🔥 Grounding and Bonding",
    difficulty: "Apprentice",
    question:
      "What is the minimum size copper grounding electrode conductor for a 200A service with ...",
    options: ["#8 AWG", "#6 AWG", "#4 AWG", "#2 AWG"],
    correctIndex: 2,
    explanation:
      "Per NEC 250.66, a 2/0 copper service requires a #4 AWG copper grounding electrode conductor ...",
    code_reference: null,
  },
  {
    id: "q2",
    article: "310 🔥 Conductors for General Wiring",
    difficulty: "Novice",
    question:
      "According to NEC 310.16, what is the ampacity of #12 AWG copper THHN at 75°C?",
    options: ["20 amps", "25 amps", "30 amps", "35 amps"],
    correctIndex: 1,
    explanation:
      "At the 75°C column in Table 310.16, #12 copper is rated for 25 amps.",
    code_reference: null,
  },
];