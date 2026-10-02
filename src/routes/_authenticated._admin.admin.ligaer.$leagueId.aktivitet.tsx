import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { activitySeenKey } from "@/lib/league-activity-counts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/aktivitet")({
  head: () => ({
    meta: [
      { title: "Aktivitetslog — Kontrolpanel | LMU Danmark" },
      { name: "description", content: "Tilmeldinger, udmeldinger, klasseskift, afbud og team-rokader i ligaen." },
      { property: "og:title", content: "Aktivitetslog — LMU Danmark" },
      { property: "og:description", content: "Deltageraktivitet i ligaen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

type Kind = "signup" | "waitlist" | "withdraw" | "auto" | "rejoin" | "class" | "number" | "promote" | "delete" | "team_add" | "team_remove" | "team_decline" | "absence" | "reserve";

const KIND_META: Record<Kind, { label: string; group: string; cls: string }> = {
  signup: { label: "Ny tilmelding", group: "signup", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  waitlist: { label: "Venteliste", group: "signup", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  promote: { label: "Rykket op", group: "signup", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  rejoin: { label: "Genindmeldt", group: "signup", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  withdraw: { label: "Udmeldt", group: "withdraw", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  auto: { label: "Auto-udmeldt (DNS)", group: "withdraw", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  delete: { label: "Tilmelding slettet", group: "withdraw", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  class: { label: "Klasseskift", group: "change", cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  number: { label: "Nummerskift", group: "change", cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  team_add: { label: "Tilføjet lineup", group: "team", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  team_remove: { label: "Fjernet fra lineup", group: "team", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  team_decline: { label: "Afviste lineup", group: "team", cls: "bg-muted text-muted-foreground" },
  absence: { label: "Afbud", group: "absence", cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
  reserve: { label: "Reserve-tilbud", group: "absence", cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
};

type Ev = { at: string; kind: Kind; userId: string | null; name: string; carClass: string | null; detail: string; actor?: string | null };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("da-DK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const cls = (c?: string | null, cat?: string | null) => [c?.replace("_", " "), cat].filter(Boolean).join(" ");

function ActivityPage() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/aktivitet" });
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [klass, setKlass] = useState("all");
  const [range, setRange] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["league-activity", leagueId],
    queryFn: async () => {
      const [{ data: league }, { data: divs }, { data: audit }, { data: lineup }] = await Promise.all([
        supabase.from("leagues").select("name").eq("id", leagueId).maybeSingle(),
        supabase.from("divisions").select("id,name,race_date").eq("league_id", leagueId),
        supabase
          .from("audit_log")
          .select("action,old_data,new_data,actor_id,actor_label,created_at")
          .eq("table_name", "entries")
          .or(`new_data->>league_id.eq.${leagueId},old_data->>league_id.eq.${leagueId}`)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("league_team_lineup")
          .select("user_id,status,created_at,effective_from,effective_until,responded_at,league_team_entries(car_class,teams(name))")
          .eq("league_id", leagueId),
      ]);
      const divIds = (divs ?? []).map((d) => d.id);
      const divName = new Map((divs ?? []).map((d) => [d.id, d.name as string]));
      const [{ data: abs }, { data: offers }] = divIds.length
        ? await Promise.all([
            supabase.from("division_absences").select("division_id,user_id,reason,created_at").in("division_id", divIds),
            supabase.from("division_reserve_offers").select("division_id,absentee_user_id,offered_user_id,car_class,driver_category,status,created_at").in("division_id", divIds),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }];

      const ids = new Set<string>();
      (audit ?? []).forEach((a: any) => {
        const r = a.new_data ?? a.old_data;
        if (r?.user_id) ids.add(r.user_id);
        if (a.actor_id) ids.add(a.actor_id);
      });
      (lineup ?? []).forEach((l: any) => ids.add(l.user_id));
      (abs ?? []).forEach((a: any) => ids.add(a.user_id));
      (offers ?? []).forEach((o: any) => { ids.add(o.offered_user_id); ids.add(o.absentee_user_id); });
      const { data: profs } = ids.size
        ? await supabase.from("profiles").select("id,display_name").in("id", [...ids])
        : { data: [] as any[] };
      const pn = new Map((profs ?? []).map((p: any) => [p.id, p.display_name as string]));
      const nm = (id?: string | null, fb?: string) => (id && pn.get(id)) || fb || "Ukendt";

      const evs: Ev[] = [];
      for (const a of (audit ?? []) as any[]) {
        const o = a.old_data, n = a.new_data;
        const r = n ?? o;
        const actor = a.actor_id ? nm(a.actor_id) : a.actor_label ?? "System";
        const base = { at: a.created_at, userId: r.user_id ?? null, name: nm(r.user_id, r.driver_name), actor };
        if (a.action === "insert") {
          evs.push({ ...base, kind: n.waitlist ? "waitlist" : "signup", carClass: n.car_class, detail: `${cls(n.car_class, n.driver_category)}${n.car_number ? ` · bil #${n.car_number}` : ""}` });
        } else if (a.action === "delete") {
          evs.push({ ...base, kind: "delete", carClass: o.car_class, detail: `${cls(o.car_class, o.driver_category)}${o.car_number ? ` · bil #${o.car_number}` : ""}` });
        } else if (o && n) {
          if (!o.withdrawn_at && n.withdrawn_at) {
            const auto = !a.actor_id;
            evs.push({ ...base, kind: auto ? "auto" : "withdraw", carClass: n.car_class, detail: `${cls(n.car_class, n.driver_category)}${auto ? " · systemet (DNS-grænse)" : ""}` });
          } else if (o.withdrawn_at && !n.withdrawn_at) {
            evs.push({ ...base, kind: "rejoin", carClass: n.car_class, detail: cls(n.car_class, n.driver_category) });
          }
          if (o.car_class !== n.car_class || o.driver_category !== n.driver_category) {
            evs.push({ ...base, kind: "class", carClass: n.car_class, detail: `${cls(o.car_class, o.driver_category) || "–"} → ${cls(n.car_class, n.driver_category)}` });
          }
          if (o.car_number !== n.car_number && o.car_class === n.car_class) {
            evs.push({ ...base, kind: "number", carClass: n.car_class, detail: `#${o.car_number ?? "–"} → #${n.car_number ?? "–"}` });
          }
          if (o.waitlist && !n.waitlist) {
            evs.push({ ...base, kind: "promote", carClass: n.car_class, detail: `Fra venteliste · ${cls(n.car_class, n.driver_category)}` });
          }
        }
      }
      for (const l of (lineup ?? []) as any[]) {
        const team = l.league_team_entries?.teams?.name ?? "Team";
        const cc = l.league_team_entries?.car_class ?? null;
        const nmU = nm(l.user_id);
        evs.push({ at: l.created_at, kind: "team_add", userId: l.user_id, name: nmU, carClass: cc, detail: `${team} · ${cls(cc)}${l.effective_from ? ` · tæller fra ${fmt(l.effective_from)}` : ""}` });
        if (l.effective_until) evs.push({ at: l.effective_until, kind: "team_remove", userId: l.user_id, name: nmU, carClass: cc, detail: `${team} · ${cls(cc)}` });
        if (l.status === "declined") evs.push({ at: l.responded_at ?? l.created_at, kind: "team_decline", userId: l.user_id, name: nmU, carClass: cc, detail: `${team} · ${cls(cc)}` });
      }
      for (const a of (abs ?? []) as any[]) {
        evs.push({ at: a.created_at, kind: "absence", userId: a.user_id, name: nm(a.user_id), carClass: null, detail: `${divName.get(a.division_id) ?? "Afdeling"}${a.reason ? ` · "${a.reason}"` : ""}` });
      }
      for (const o of (offers ?? []) as any[]) {
        evs.push({ at: o.created_at, kind: "reserve", userId: o.offered_user_id, name: nm(o.offered_user_id), carClass: o.car_class, detail: `Erstatning for ${nm(o.absentee_user_id)} · ${divName.get(o.division_id) ?? "Afdeling"} · ${o.status}` });
      }
      evs.sort((x, y) => y.at.localeCompare(x.at));
      return { name: league?.name ?? "Liga", evs };
    },
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const days = range === "7" ? 7 : range === "30" ? 30 : null;
    const s = q.trim().toLowerCase();
    return (data?.evs ?? []).filter((e) => {
      if (group !== "all" && KIND_META[e.kind].group !== group) return false;
      if (klass !== "all" && !(e.carClass ?? "").toUpperCase().startsWith(klass)) return false;
      if (days && now - new Date(e.at).getTime() > days * 864e5) return false;
      if (s && !e.name.toLowerCase().includes(s) && !e.detail.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [data, q, group, klass, range]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="gap-1">
        <Link to="/admin/ligaer"><ArrowLeft className="h-4 w-4" /> Tilbage til ligaer</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold">Aktivitetslog</h1>
        <p className="text-sm text-muted-foreground">{data?.name ?? ""} — tilmeldinger, udmeldinger, klasseskift, afbud og team-rokader.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søg kører/hold…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle hændelser</SelectItem>
            <SelectItem value="signup">Tilmeldinger</SelectItem>
            <SelectItem value="withdraw">Udmeldelser</SelectItem>
            <SelectItem value="change">Klasse-/nummerskift</SelectItem>
            <SelectItem value="team">Team-lineups</SelectItem>
            <SelectItem value="absence">Afbud & reserver</SelectItem>
          </SelectContent>
        </Select>
        <Select value={klass} onValueChange={setKlass}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle klasser</SelectItem>
            <SelectItem value="LMP2">LMP2</SelectItem>
            <SelectItem value="LMGT3">LMGT3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Hele sæsonen</SelectItem>
            <SelectItem value="7">Seneste 7 dage</SelectItem>
            <SelectItem value="30">Seneste 30 dage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Indlæser…</p>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Kunne ikke hente aktivitet.</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Ingen hændelser matcher filtrene.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((e, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(e.at)}</span>
                  <Badge variant="outline" className={`w-fit shrink-0 ${KIND_META[e.kind].cls}`}>{KIND_META[e.kind].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-sm text-muted-foreground"> — {e.detail}</span>
                    {e.actor && e.userId && e.actor !== e.name && e.kind !== "auto" && (
                      <span className="block text-xs text-muted-foreground">Udført af {e.actor}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{filtered.length} hændelser</p>
    </div>
  );
}
