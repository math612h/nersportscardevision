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

export async function signDiscordState(userId: string): Promise<string> {
  const nonce = b64urlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = `${userId}:${nonce}:${exp}`;
  const sig = await hmac(getEnv("DISCORD_CLIENT_SECRET"), payload);
  return b64urlEncode(new TextEncoder().encode(payload)) + "." + b64urlEncode(sig);
}

export async function verifyDiscordState(token: string): Promise<{ userId: string } | null> {
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
  const [userId, , expStr] = payload.split(":");
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  return { userId };
}

export function getDiscordRedirectUri(origin: string): string {
  return `${origin}/api/public/discord/callback`;
}

export function buildDiscordAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: getEnv("DISCORD_CLIENT_ID"),
    redirect_uri: getDiscordRedirectUri(origin),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordCode(code: string, origin: string): Promise<{
  discord_user_id: string;
  discord_username: string;
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
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };
  return { discord_user_id: me.id, discord_username: me.global_name || me.username };
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
