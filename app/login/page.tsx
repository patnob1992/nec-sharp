"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  function getFriendlyAuthError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes("invalid login credentials")) {
      return "Email or password is incorrect. Try again.";
    }
    if (lower.includes("email not confirmed")) {
      return "Please confirm your email before signing in.";
    }
    if (lower.includes("already registered")) {
      return "This email is already registered. Try signing in.";
    }
    return message;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { error } =
      authMode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setErrorMsg(getFriendlyAuthError(error.message));
      return;
    }

    if (authMode === "signUp") {
      setSuccessMsg("Account created. Check your email to confirm your account before signing in.");
      setPassword("");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(180deg, var(--nec-bg) 0%, var(--nec-bg2) 100%)",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        position: "relative",
        overflow: "hidden",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 40,
          borderRadius: 20,
          background: "var(--nec-card)",
          border: "1px solid var(--nec-border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 14, color: "var(--nec-gold)", marginBottom: 8, letterSpacing: "0.05em" }}>
            ⚡
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              marginBottom: 12,
              color: "white",
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            NEC Sharp
          </h1>
          <p style={{ fontSize: 14, color: "var(--nec-muted)", fontWeight: 400, lineHeight: 1.5 }}>
            Enter Training
            <br />
            <span style={{ color: "var(--nec-muted2)" }}>Sharpen your edge.</span>
          </p>
        </div>

        <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "var(--nec-muted)", fontWeight: 500 }}>
          Email
        </label>
        <input
          ref={emailInputRef}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            marginBottom: 20,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--nec-border)",
            color: "white",
            fontSize: 15,
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--nec-border2)";
            e.target.style.boxShadow = "0 0 0 3px var(--nec-blueGlow)";
            e.target.style.outline = "none";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--nec-border)";
            e.target.style.boxShadow = "none";
          }}
        />

        <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "var(--nec-muted)", fontWeight: 500 }}>
          Password
        </label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            marginBottom: 28,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--nec-border)",
            color: "white",
            fontSize: 15,
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--nec-border2)";
            e.target.style.boxShadow = "0 0 0 3px var(--nec-blueGlow)";
            e.target.style.outline = "none";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--nec-border)";
            e.target.style.boxShadow = "none";
          }}
        />

        {errorMsg ? (
          <div style={{ color: "var(--nec-danger)", marginBottom: 16, fontSize: 14 }}>{errorMsg}</div>
        ) : null}
        {successMsg ? (
          <div
            style={{
              color: "var(--nec-blue2)",
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            <div>{successMsg}</div>
            <button
              type="button"
              disabled
              style={{
                marginTop: 8,
                background: "none",
                border: "none",
                color: "var(--nec-muted2)",
                fontSize: 12,
                cursor: "not-allowed",
                textDecoration: "underline",
              }}
            >
              Resend confirmation email (coming soon)
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="nec-btn-primary"
          style={{
            width: "100%",
            padding: 18,
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(59,130,255,0.15) 0%, var(--nec-blue) 30%, var(--nec-blue) 100%)",
            color: "white",
            fontWeight: 700,
            fontSize: 17,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            border: "none",
            boxShadow: "var(--nec-shadow-3)",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = "scale(1.02)";
              e.currentTarget.style.boxShadow = "0 0 24px var(--nec-blueGlow)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "var(--nec-shadow-3)";
          }}
        >
          {loading ? (authMode === "signIn" ? "Entering..." : "Creating...") : authMode === "signIn" ? "Enter Training" : "Create Account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode((m) => (m === "signIn" ? "signUp" : "signIn"));
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          style={{
            marginTop: 12,
            width: "100%",
            background: "none",
            border: "none",
            color: "var(--nec-muted2)",
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {authMode === "signIn" ? "New here? Create account" : "Already have an account? Sign in"}
        </button>

        <p style={{ marginTop: 16, fontSize: 12, color: "var(--nec-muted2)", textAlign: "center" }}>
          5 questions. Daily discipline.
        </p>
      </form>
    </div>
  );
}
