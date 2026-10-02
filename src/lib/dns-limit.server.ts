// Automatisk udmelding af kørere, der har nået ligaens DNS-grænse.
// Udmelding er "blød" (withdrawn_at), så resultater og holdpoint bevares.
import { seatCap, isSplitClass } from "@/lib/class-capacity";

const SITE = "https://lmudanmark.dk";

async function notify(admin: any, userId: string, title: string, body: string, link: string) {
  await admin.from("notifications").insert({ user_id: userId, title, body, link });
  try {
    const { sendPushToUser } = await import("./push.server");
    void sendPushToUser(userId, { title, body: body.slice(0, 140), url: link }).catch(() => {});
  } catch (_) {}
  try {
    const { data: priv } = await admin
      .from("profiles_private").select("discord_user_id").eq("user_id", userId).maybeSingle();
    const discordId = priv?.discord_user_id ?? null;
    if (discordId) {
      const { sendDiscordDM } = await import("./discord.server");
      const res = await sendDiscordDM(discordId, `**${title}**\n\n${body}\n\n${SITE}${link}`);
      if (!res.ok) console.error("DNS-limit DM failed", userId, res);
    }
  } catch (e) {
    console.error("DNS-limit DM error", e);
  }
}

export type DnsLimitResult = {
  removed: { user_id: string; driver_name: string; car_class: string; dns: number }[];
  promoted: { user_id: string; driver_name: string; car_class: string }[];
};

export async function enforceDnsLimit(admin: any, leagueId: string): Promise<DnsLimitResult> {
  const result: DnsLimitResult = { removed: [], promoted: [] };
  const { data: league } = await admin
    .from("leagues").select("id,name,class_configs").eq("id", leagueId).maybeSingle();
  if (!league) return result;
  const configs: any[] = Array.isArray(league.class_configs) ? league.class_configs : [];
  const limitFor = (cls: string, cat: string) => {
    const c = configs.find((x) => x.car_class === cls && x.driver_category === cat)
      ?? configs.find((x) => x.car_class === cls);
    const n = Number(c?.dns_limit ?? 0);
    return n > 0 ? n : 0;
  };
  if (!configs.some((c) => Number(c?.dns_limit ?? 0) > 0)) return result;

  const { data: divisions } = await admin.from("divisions").select("id,settings").eq("league_id", leagueId);
  const dnsCount = new Map<string, number>();
  for (const d of divisions ?? []) {
    const rows: any[] = Array.isArray(d.settings?.results) ? d.settings.results : [];
    for (const r of rows) {
      if (!r?.user_id || r.joiner || r.status === "joiner") continue;
      const isDns = r.status === "dns" || (!r.status && r.dns);
      if (!isDns) continue;
      const k = `${r.user_id}|${r.car_class}`;
      dnsCount.set(k, (dnsCount.get(k) ?? 0) + 1);
    }
  }

  const { data: entries } = await admin
    .from("entries")
    .select("id,user_id,driver_name,car_class,driver_category,waitlist,created_at")
    .eq("league_id", leagueId).is("division_id", null).is("withdrawn_at", null);
  const all: any[] = entries ?? [];
  const nowIso = new Date().toISOString();
  const removedIds = new Set<string>();

  for (const e of all) {
    if (e.waitlist) continue;
    const limit = limitFor(e.car_class, e.driver_category);
    if (!limit) continue;
    const n = dnsCount.get(`${e.user_id}|${e.car_class}`) ?? 0;
    if (n < limit) continue;

    const { error } = await admin.from("entries")
      .update({ withdrawn_at: nowIso, waitlist: false }).eq("id", e.id).is("withdrawn_at", null);
    if (error) { console.error("DNS-limit withdraw failed", e.id, error); continue; }
    await admin.from("league_team_lineup").update({ effective_until: nowIso })
      .eq("league_id", leagueId).eq("user_id", e.user_id).is("effective_until", null);
    removedIds.add(e.id);
    result.removed.push({ user_id: e.user_id, driver_name: e.driver_name, car_class: e.car_class, dns: n });
    try {
      await admin.rpc("log_audit", {
        _action: "dns_limit_withdraw", _table: "entries", _row_id: e.id,
        _old: null, _new: null, _metadata: { league_id: leagueId, dns: n, limit },
      });
    } catch (_) {}
    await notify(
      admin, e.user_id,
      `Du er blevet meldt ud af ${league.name}`,
      `Du er blevet meldt ud af ${league.name}, fordi du har ${n} DNS (udeblivelser) i denne sæson, og ligaens grænse er ${limit}. ` +
        `Det gør vi for at holde griddet fyldt for dem, der kører. Dine resultater står stadig i stillingerne.\n\n` +
        `Vi håber at se dig på griddet igen i en kommende liga! 🏁`,
      `/ligaer/${leagueId}`,
    );
  }

  if (removedIds.size === 0) return result;

  // Ventelisteoprykning pr. klasse/kategori
  const remaining = all.filter((e) => !removedIds.has(e.id));
  const groups = new Set(all.filter((e) => removedIds.has(e.id)).map((e) => `${e.car_class}|${e.driver_category}`));
  for (const g of groups) {
    const [cls, cat] = g.split("|");
    const split = isSplitClass(configs as any, cls);
    const cap = seatCap(configs as any, cls, cat);
    const onGrid = remaining.filter((e) => !e.waitlist && e.car_class === cls && (!split || e.driver_category === cat)).length;
    let room = cap == null ? Infinity : Math.max(0, cap - onGrid);
    if (room === 0) continue;
    const waiters = remaining
      .filter((e) => e.waitlist && e.car_class === cls && e.driver_category === cat)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    if (waiters.length === 0) continue;
    const { data: profs } = await admin.from("profiles").select("id,approved").in("id", waiters.map((w) => w.user_id));
    const approved = new Set((profs ?? []).filter((p: any) => p.approved).map((p: any) => p.id));
    for (const w of waiters) {
      if (room <= 0) break;
      if (!approved.has(w.user_id)) continue;
      const { error } = await admin.from("entries").update({ waitlist: false }).eq("id", w.id);
      if (error) continue;
      w.waitlist = false;
      room--;
      result.promoted.push({ user_id: w.user_id, driver_name: w.driver_name, car_class: w.car_class });
      await notify(
        admin, w.user_id,
        `Du er rykket op fra ventelisten i ${league.name}`,
        `En plads er blevet ledig i ${cls} · ${cat}. Du er nu på griddet for resten af sæsonen.`,
        `/ligaer/${leagueId}`,
      );
    }
  }
  return result;
}
