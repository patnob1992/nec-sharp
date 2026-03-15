import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isValidSupabaseUrl = (() => {
  if (!supabaseUrl) return false;
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
})();

console.log("[supabase] NEXT_PUBLIC_SUPABASE_URL present:", Boolean(supabaseUrl), "valid_https_url:", isValidSupabaseUrl);
console.log("[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY present:", Boolean(supabaseAnonKey));

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);