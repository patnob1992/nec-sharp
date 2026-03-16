"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "nec_install_prompt_dismissed_until";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    );
  });
  const [isIosSafari] = useState(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const safari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    return ios && safari;
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const untilRaw = localStorage.getItem(DISMISS_KEY);
      const until = untilRaw ? Number(untilRaw) : 0;
      return Number.isFinite(until) && until > Date.now();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const onModeChange = () => {
      setIsStandalone(
        media.matches ||
          (typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
            Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
      );
    };
    const onInstalled = () => setIsStandalone(true);
    media.addEventListener("change", onModeChange);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      media.removeEventListener("change", onModeChange);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  const canShow = useMemo(() => {
    if (dismissed || isStandalone) return false;
    return Boolean(deferredPrompt) || isIosSafari;
  }, [dismissed, isStandalone, deferredPrompt, isIosSafari]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      // Ignore localStorage availability issues.
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "web" }));
    setDeferredPrompt(null);
    dismiss();
  }, [deferredPrompt, dismiss]);

  if (!canShow) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--nec-border)",
        color: "var(--nec-text)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Install NEC Sharp</div>
      <div style={{ fontSize: 12, color: "var(--nec-muted)", lineHeight: 1.45 }}>
        {deferredPrompt
          ? "Add NEC Sharp to your home screen for a faster, app-like launch."
          : "On iPhone Safari: tap Share, then Add to Home Screen."}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: "transparent",
            border: "1px solid var(--nec-border)",
            color: "var(--nec-muted)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
        {deferredPrompt && (
          <button
            type="button"
            onClick={install}
            style={{
              background: "var(--nec-blue)",
              border: "none",
              color: "white",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
