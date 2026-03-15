# Click-blocker audit – NEC Sharp dashboard (Send Feedback)

## A. Findings list

| # | File | Line range | Element / rule | Always mounted? | Can intercept clicks? |
|---|------|------------|----------------|------------------|------------------------|
| 1 | **app/globals.css** | 59–69 | `body::before` – full-screen grid (position: fixed, inset: 0, z-index: 0) | Yes (global) | No – has `pointer-events: none !important` |
| 2 | **app/dashboard/page.tsx** | 210–224 | `<main>` – dashboard root (position: relative, zIndex: 10, pointerEvents: "auto") | Yes when on dashboard | No – is the content layer |
| 3 | **app/dashboard/page.tsx** | 226 | Content column div (position: relative, zIndex: 1) | Yes | No |
| 4 | **app/dashboard/page.tsx** | 331–341 | Early Access badge wrapper (pointerEvents: "none") | Only when `missedYesterday` | No – explicitly non-interactive |
| 5 | **app/dashboard/page.tsx** | 654–694 | Feedback section (position: relative, zIndex: 20, pointerEvents: "auto") – contains Send Feedback | Yes | No – is the button’s container |
| 6 | **app/dashboard/page.tsx** | 697–706 | **StatsModal** – rendered only when `statsOpen && rankSummary && user` | **Conditional** | Yes when open (full-screen fixed backdrop) |
| 7 | **app/dashboard/page.tsx** | 709–721 | **WeeklySummaryModal** – rendered when `weeklySummaryOpen && storedWeekly && storedWeekly.weekKey !== currentWeek` | **Conditional** (but **auto-opens** on load when there is last-week data) | Backdrop has `pointerEvents: "none"`; inner card has `pointerEvents: "auto"` – in theory backdrop passes clicks; in practice may still block in some stacking/hit-test cases |
| 8 | **app/dashboard/page.tsx** | 724–726 | **FeedbackModal** – rendered only when `feedbackOpen && user` | **Conditional** | Yes when open |
| 9 | **app/dashboard/page.tsx** | 751–764 | StatsModal backdrop (position: fixed, inset: 0, zIndex: 1000) | Only when StatsModal open | Yes when mounted |
| 10 | **app/dashboard/page.tsx** | 861–874 | WeeklySummaryModal backdrop (position: fixed, inset: 0, zIndex: 1000, pointerEvents: "none") | Only when WeeklySummaryModal open | Intended no; may still block in some environments |
| 11 | **app/components/FeedbackModal.tsx** | 34–45 | FeedbackModal backdrop (position: fixed, inset: 0, zIndex: 1000) | Only when FeedbackModal open | Yes when mounted |
| 12 | **app/layout.tsx** | 20–33 | Root layout (body, children) | Yes | No overlays |
| 13 | **app/page.tsx** | 1191–1201, 1253–1265 | Level-up modal, milestone toast (fixed, high z-index) | Only on **practice page** (/), not on /dashboard | N/A for dashboard |

---

## B. Most likely blocker

**WeeklySummaryModal** (app/dashboard/page.tsx, lines 861–874 and 709–721).

- It is the only overlay that **auto-opens** on the dashboard (useEffect sets `weeklySummaryOpen` to true when there is last-week data and the week has changed).
- When open, it mounts a **full-screen fixed backdrop** (position: fixed, inset: 0, zIndex: 1000). Even with `pointerEvents: "none"` on the backdrop, the modal is a **sibling of the content column** and is painted **after** it (later in DOM) with a much higher z-index. So the modal layer sits above the main content and the feedback section (which lives inside the content column with zIndex: 20). In some browsers or stacking contexts, hit-testing can still treat the modal layer as the target for clicks in the bottom area (e.g. over the Send Feedback button), so the button never receives the click.
- StatsModal and FeedbackModal are only mounted when the user explicitly opens them, so they are less likely to be the “always blocking” case; the one that’s often present without a clear user action is WeeklySummaryModal.

---

## C. Fix (exact code change)

**Goal:** Make the Send Feedback block always on top of any modal overlay so it is reliably clickable, without changing layout or the Early Access badge.

**Approach:** Render the **feedback footer block** (tagline + Send Feedback + Sign out) as a **sibling of the modals, after them in the DOM**, with **position: relative** and **zIndex: 1001**. It stays visually in the same place (centered, same width) but in stacking order it sits above all modals (z-index 1000), so it always receives clicks.

**File:** `app/dashboard/page.tsx`

- **Remove** the existing feedback section from inside the content column (the div that currently contains “Five questions a day.”, Send Feedback, Sign out).
- **Insert** that same block again **after** the three modal conditionals (after `FeedbackModal`), wrapped in a centered container with `zIndex: 1001` so the footer is always on top.
