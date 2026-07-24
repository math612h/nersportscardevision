// Client-side analytics tracker. Batches events and flushes periodically
// and on tab hide. Uses the anon Supabase client so it works for guests.
import { supabase } from "@/integrations/supabase/client";

type EventPayload = {
  session_id: string;
  user_id: string | null;
  event_type: "pageview" | "click" | "session";
  path: string | null;
  referrer: string | null;
  duration_ms: number | null;
  user_agent: string | null;
};

const SESSION_KEY = "lmu_analytics_session";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity

function getSessionId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; last: number; start: number };
      if (Date.now() - parsed.last < SESSION_TTL_MS) {
        parsed.last = Date.now();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
        return parsed.id;
      }
    }
  } catch {}
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = { id, start: Date.now(), last: Date.now() };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch {}
  return id;
}

function getSessionStart(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return (JSON.parse(raw) as { start: number }).start;
  } catch {}
  return Date.now();
}

let queue: EventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let started = false;
let lastPath: string | null = null;
let pageEnteredAt = 0;

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await supabase.from("analytics_events").insert(batch);
  } catch {
    // swallow — don't disrupt UX
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { void flush(); }, 4000);
}

function enqueue(ev: Omit<EventPayload, "session_id" | "user_id" | "user_agent">) {
  queue.push({
    ...ev,
    session_id: getSessionId(),
    user_id: currentUserId,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  scheduleFlush();
}

export function trackPageview(path: string) {
  if (typeof window === "undefined") return;
  // Skip admin pages so admins don't inflate their own stats
  if (path.startsWith("/admin")) return;

  // Record time on previous page
  if (lastPath && pageEnteredAt) {
    const dur = Date.now() - pageEnteredAt;
    if (dur > 200 && dur < 60 * 60 * 1000) {
      enqueue({ event_type: "session", path: lastPath, referrer: null, duration_ms: dur });
    }
  }
  lastPath = path;
  pageEnteredAt = Date.now();
  enqueue({
    event_type: "pageview",
    path,
    referrer: document.referrer || null,
    duration_ms: null,
  });
}

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
}

export function initAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Global click tracking (throttled: coalesce identical selectors within 500ms)
  let lastClickAt = 0;
  window.addEventListener("click", (e) => {
    const now = Date.now();
    if (now - lastClickAt < 250) return;
    lastClickAt = now;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.closest("a,button,[role='button']") as HTMLElement | null;
    if (!tag) return;
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return;
    enqueue({
      event_type: "click",
      path,
      referrer: (tag.getAttribute("href") || tag.getAttribute("aria-label") || tag.textContent?.slice(0, 80) || null),
      duration_ms: null,
    });
  }, { passive: true, capture: true });

  const handleHide = () => {
    if (lastPath && pageEnteredAt) {
      const dur = Date.now() - pageEnteredAt;
      if (dur > 200 && dur < 60 * 60 * 1000) {
        enqueue({ event_type: "session", path: lastPath, referrer: null, duration_ms: dur });
        pageEnteredAt = Date.now(); // reset so we don't double-count on return
      }
    }
    void flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handleHide();
  });
  window.addEventListener("pagehide", handleHide);
  window.addEventListener("beforeunload", handleHide);

  // Session start marker (useful for total sessions metric)
  const started_at = getSessionStart();
  if (Date.now() - started_at < 5000) {
    enqueue({ event_type: "session", path: window.location.pathname, referrer: document.referrer || null, duration_ms: 0 });
  }
}
