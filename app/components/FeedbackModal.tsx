"use client";

import { useState } from "react";
import { submitBetaFeedback } from "@/lib/feedback";

export function FeedbackModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const canSubmit = message.trim().length >= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    setError(null);
    try {
      const result = await submitBetaFeedback(userId, message);
      if (result.ok) {
        setStatus("sent");
        setMessage("");
        setTimeout(onClose, 800);
      } else {
        setStatus("error");
        setError(result.error ?? "Could not send");
      }
    } catch {
      setStatus("error");
      setError("Could not send");
    }
  }

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
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--nec-text)", marginBottom: 12 }}>
          Send Feedback
        </div>
        {status === "sent" ? (
          <div style={{ fontSize: 13, color: "var(--nec-muted)" }}>Feedback sent.</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's working? What could be better?"
              rows={4}
              disabled={status === "sending"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                background: "var(--nec-card)",
                border: "1px solid var(--nec-border)",
                color: "var(--nec-text)",
                fontSize: 13,
                resize: "vertical",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            {error && (
              <div style={{ fontSize: 12, color: "var(--nec-danger)", marginBottom: 8 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  background: "transparent",
                  border: "1px solid var(--nec-border)",
                  color: "var(--nec-muted)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === "sending" || !canSubmit}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  background: "var(--nec-blue)",
                  border: "none",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: status === "sending" || !canSubmit ? "not-allowed" : "pointer",
                }}
              >
                {status === "sending" ? "Sending…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
