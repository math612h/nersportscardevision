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

export function buildDiscordAvatarUrl(discordUserId: string, avatarHash: string | null | undefined): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${ext}?size=128`;
}

export async function fetchDiscordGuildMember(discordUserId: string): Promise<{
  nick: string | null;
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null } | null;
} | null> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    nick?: string | null;
    user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  };
  return {
    nick: data.nick ?? null,
    user: data.user ?? null,
  };
}

export async function fetchDiscordUserAvatar(discordUserId: string): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/users/${discordUserId}`, {
    headers: { Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}` },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as { id: string; avatar?: string | null };
  return buildDiscordAvatarUrl(u.id, u.avatar ?? null);
}

export async function exchangeDiscordCode(code: string, origin: string): Promise<{
  discord_user_id: string;
  discord_username: string;
  discord_server_nickname: string | null;
  discord_email: string | null;
  discord_email_verified: boolean;
  discord_avatar_url: string | null;
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
    avatar?: string | null;
  };

  // Also fetch guild member to get the server nickname (per-server profile name)
  const member = await fetchDiscordGuildMember(me.id);
  const serverNickname = member?.nick ?? null;

  return {
    discord_user_id: me.id,
    discord_username: me.global_name || me.username,
    discord_server_nickname: serverNickname,
    discord_email: me.email ?? null,
    discord_email_verified: !!me.verified,
    discord_avatar_url: buildDiscordAvatarUrl(me.id, me.avatar ?? null),
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

export async function setGuildMemberNickname(
  discordUserId: string,
  nickname: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${getEnv("DISCORD_BOT_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nick: nickname.slice(0, 32) }),
    },
  );
  if (res.status === 200 || res.status === 204) return { ok: true, status: res.status };
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

export type DiscordComponent = Record<string, unknown>;

export async function sendDiscordDM(
  discordUserId: string,
  content: string,
  components?: DiscordComponent[],
): Promise<{ ok: boolean; status: number; message?: string; channelId?: string; messageId?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmRes.ok) {
    const text = await dmRes.text().catch(() => "");
    return { ok: false, status: dmRes.status, message: `DM-kanal kunne ikke åbnes: ${text}` };
  }
  const dm = (await dmRes.json()) as { id: string };

  const body: Record<string, unknown> = {
    content: content.slice(0, 1900),
    allowed_mentions: { parse: [] },
  };
  if (components && components.length > 0) body.components = components;

  const msgRes = await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (msgRes.status === 200 || msgRes.status === 201) {
    let messageId: string | undefined;
    try {
      const json = (await msgRes.json()) as { id?: string };
      messageId = json?.id;
    } catch (_) {}
    return { ok: true, status: msgRes.status, channelId: dm.id, messageId };
  }
  const text = await msgRes.text().catch(() => "");
  return { ok: false, status: msgRes.status, message: text };
}

export async function editDiscordMessage(
  channelId: string,
  messageId: string,
  content: string,
  components?: DiscordComponent[],
): Promise<{ ok: boolean; status: number; message?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const body: Record<string, unknown> = {
    content: content.slice(0, 1900),
    allowed_mentions: { parse: [] },
    components: components ?? [],
  };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 200) return { ok: true, status: 200 };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: text };
}

// Verify Discord interaction signature (ed25519). Returns true if valid.
export async function verifyDiscordInteractionSignature(
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  try {
    const hexToBytes = (h: string) => {
      const out = new Uint8Array(h.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
      return out;
    };
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      key,
      hexToBytes(signatureHex),
      data,
    );
  } catch {
    return false;
  }
}

export async function sendDiscordChannelMessage(
  channelId: string,
  content: string,
  roleMentions?: string[],
): Promise<{ ok: boolean; status: number; message?: string; messageId?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const allowedMentions = roleMentions && roleMentions.length > 0
    ? { parse: [] as string[], roles: roleMentions }
    : { parse: [] as string[] };
  const msgRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: allowedMentions }),
  });
  if (msgRes.status === 200 || msgRes.status === 201) {
    let messageId: string | undefined;
    try {
      const json = (await msgRes.json()) as { id?: string };
      messageId = json?.id;
    } catch (_) {}
    return { ok: true, status: msgRes.status, messageId };
  }
  const text = await msgRes.text().catch(() => "");
  return { ok: false, status: msgRes.status, message: text };
}

export async function deleteDiscordChannelMessage(
  channelId: string,
  messageId: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (res.status === 204 || res.status === 200) return { ok: true, status: res.status };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: text };
}

// List all guild members that have a given role. Paginates via `after`.
// NOTE: Listing all guild members requires the GUILD_MEMBERS privileged intent on the bot.
export async function listGuildMemberIdsWithRole(roleId: string): Promise<string[]> {
  const members = await listGuildMembersWithRole(roleId);
  return members.map((m) => m.id);
}

// Same as above but also returns each member's server nickname (if any).
export async function listGuildMembersWithRole(
  roleId: string,
): Promise<Array<{ id: string; nick: string | null }>> {
  const guildId = getEnv("DISCORD_GUILD_ID");
  const botToken = getEnv("DISCORD_BOT_TOKEN");
  const out: Array<{ id: string; nick: string | null }> = [];
  let after = "0";
  for (let page = 0; page < 50; page++) {
    const url = `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord guild member list fejlede: ${res.status} ${text}`);
    }
    const members = (await res.json()) as Array<{
      user?: { id?: string };
      roles?: string[];
      nick?: string | null;
    }>;
    if (!Array.isArray(members) || members.length === 0) break;
    for (const m of members) {
      const uid = m.user?.id;
      if (!uid) continue;
      if (Array.isArray(m.roles) && m.roles.includes(roleId)) {
        out.push({ id: uid, nick: m.nick ?? null });
      }
    }
    if (members.length < 1000) break;
    const lastId = members[members.length - 1]?.user?.id;
    if (!lastId) break;
    after = lastId;
  }
  return out;
}



