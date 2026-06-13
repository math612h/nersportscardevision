// Server-only Discord helpers. Never import from client code.

const DISCORD_API = "https://discord.com/api/v10";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Mangler env-variabel: ${name}`);
  return v;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

// State payloads:
//   link:<userId>:<nonce>:<exp>     — known user linking Discord
//   login::<nonce>:<exp>            — anonymous login/signup via Discord
export type DiscordStateMode = "link" | "login";

export async function signDiscordState(mode: DiscordStateMode, userId: string | null): Promise<string> {
  const nonce = b64urlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = `${mode}:${userId ?? ""}:${nonce}:${exp}`;
  const sig = await hmac(getEnv("DISCORD_CLIENT_SECRET"), payload);
  return b64urlEncode(new TextEncoder().encode(payload)) + "." + b64urlEncode(sig);
}

export async function verifyDiscordState(token: string): Promise<{ mode: DiscordStateMode; userId: string | null } | null> {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlDecode(p));
  } catch {
    return null;
  }
  const expected = await hmac(getEnv("DISCORD_CLIENT_SECRET"), payload);
  if (!timingSafeEqual(expected, b64urlDecode(s))) return null;
  const parts = payload.split(":");
  if (parts.length < 4) return null;
  const [mode, userId, , expStr] = parts;
  const exp = Number(expStr);
  if ((mode !== "link" && mode !== "login") || !Number.isFinite(exp) || exp < Date.now()) return null;
  return { mode: mode as DiscordStateMode, userId: userId || null };
}

export function getDiscordRedirectUri(origin: string): string {
  return `${origin}/api/public/discord/callback`;
}

export function buildDiscordAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: getEnv("DISCORD_CLIENT_ID"),
    redirect_uri: getDiscordRedirectUri(origin),
    response_type: "code",
    scope: "identify email",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordCode(code: string, origin: string): Promise<{
  discord_user_id: string;
  discord_username: string;
  discord_email: string | null;
  discord_email_verified: boolean;
}> {
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("DISCORD_CLIENT_ID"),
      client_secret: getEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordRedirectUri(origin),
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Discord token-udveksling fejlede: ${tokenRes.status} ${t}`);
  }
  const tokenData = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!meRes.ok) {
    const t = await meRes.text();
    throw new Error(`Kunne ikke hente Discord-bruger: ${meRes.status} ${t}`);
  }
  const me = (await meRes.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    email?: string | null;
    verified?: boolean;
  };
  return {
    discord_user_id: me.id,
    discord_username: me.global_name || me.username,
    discord_email: me.email ?? null,
    discord_email_verified: !!me.verified,
  };
}

export async function addGuildRole(discordUserId: string, roleId: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}`,
        "Content-Length": "0",
      },
    },
  );
  if (res.status === 204) return { ok: true, status: 204 };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: text };
}

export async function removeGuildRole(discordUserId: string, roleId: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}` },
    },
  );
  if (res.status === 204 || res.status === 404) return { ok: true, status: res.status };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: text };
}

export async function isUserInGuild(discordUserId: string): Promise<{ inGuild: boolean; status: number; message?: string }> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}` } },
  );
  if (res.status === 200) return { inGuild: true, status: 200 };
  if (res.status === 404) return { inGuild: false, status: 404 };
  const text = await res.text().catch(() => "");
  return { inGuild: false, status: res.status, message: text };
}

export async function sendDiscordDM(discordUserId: string, content: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  // 1) Open a DM channel with the user
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmRes.ok) {
    const text = await dmRes.text().catch(() => "");
    return { ok: false, status: dmRes.status, message: `DM-kanal kunne ikke åbnes: ${text}` };
  }
  const dm = (await dmRes.json()) as { id: string };

  // 2) Post the message
  const msgRes = await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (msgRes.status === 200 || msgRes.status === 201) return { ok: true, status: msgRes.status };
  const text = await msgRes.text().catch(() => "");
  return { ok: false, status: msgRes.status, message: text };
}

export async function sendDiscordChannelMessage(channelId: string, content: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const msgRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (msgRes.status === 200 || msgRes.status === 201) return { ok: true, status: msgRes.status };
  const text = await msgRes.text().catch(() => "");
  return { ok: false, status: msgRes.status, message: text };
}

