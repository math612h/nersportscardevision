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

let channel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;
let onlineSince = 0;
let currentPath = "/";

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

export function initPresence() {
  if (channel || typeof window === "undefined") return;
  onlineSince = Date.now();
  currentPath = window.location.pathname;
  channel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: sessionKey() } },
  });
  channel.subscribe((status) => {
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
