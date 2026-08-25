// Client-side live presence. Tracks the current visitor on a Supabase
// Realtime presence channel so admins can see who is online right now,
// which page they are on, and how long they have been online.
import { supabase } from "@/integrations/supabase/client";

export const PRESENCE_CHANNEL = "site-presence";

export type PresencePayload = {
  userId: string | null;
  path: string;
  since: number; // epoch ms when this tab session came online
};

export type OnlineVisitor = PresencePayload & { key: string };

let channel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;
let onlineSince = 0;
let currentPath = "/";

let visitors: OnlineVisitor[] = [];
const listeners = new Set<(v: OnlineVisitor[]) => void>();

const KEY_STORAGE = "lmu_presence_key";

function sessionKey(): string {
  try {
    let k = sessionStorage.getItem(KEY_STORAGE);
    if (!k) {
      k = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(KEY_STORAGE, k);
    }
    return k;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function track() {
  if (!channel) return;
  const payload: PresencePayload = {
    userId: currentUserId,
    path: currentPath,
    since: onlineSince,
  };
  try {
    await channel.track(payload);
  } catch {
    // realtime hiccup — next update retries
  }
}

function syncState() {
  if (!channel) return;
  const state = channel.presenceState<PresencePayload>();
  const list: OnlineVisitor[] = [];
  for (const [key, metas] of Object.entries(state)) {
    const p = metas[metas.length - 1];
    if (!p) continue;
    list.push({
      key,
      userId: p.userId ?? null,
      path: p.path ?? "/",
      since: typeof p.since === "number" ? p.since : Date.now(),
    });
  }
  visitors = list;
  listeners.forEach((fn) => fn(visitors));
}

export function initPresence() {
  if (channel || typeof window === "undefined") return;
  onlineSince = Date.now();
  currentPath = window.location.pathname;
  channel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: sessionKey() } },
  });
  channel
    .on("presence", { event: "sync" }, syncState)
    .on("presence", { event: "join" }, syncState)
    .on("presence", { event: "leave" }, syncState)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void track();
    });
}

export function updatePresencePath(path: string) {
  if (path === currentPath) return;
  currentPath = path;
  void track();
}

export function setPresenceUser(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  void track();
}

/** Subscribe to the live list of online visitors. Returns an unsubscribe fn. */
export function subscribeToPresence(fn: (v: OnlineVisitor[]) => void): () => void {
  initPresence();
  listeners.add(fn);
  fn(visitors);
  return () => { listeners.delete(fn); };
}

export function isPresenceConnected(): boolean {
  return channel?.state === "joined";
}
