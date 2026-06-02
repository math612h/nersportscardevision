import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Calendar, BookOpen, ArrowLeft, MapPin, UserPlus, Users, Trophy, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WEATHER_BY_KEY, type WeatherKey, type ClassConfig } from "@/lib/tracks";

export const Route = createFileRoute("/ligaer/$leagueId")({
  component: LeagueDetail,
});

function LeagueDetail() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId" });

  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("*, entries(count)")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle ligaer
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{league?.name}</h1>
        {league?.description && <p className="mt-1 text-muted-foreground">{league.description}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {configs.length > 0
            ? configs.map((c, i) => (
                <Badge key={i} variant="outline">{c.car_class} {c.driver_category} · #{c.number_from}-{c.number_to}</Badge>
              ))
            : (<>
                {(league as any)?.car_class && <Badge>{(league as any).car_class}</Badge>}
                {(league as any)?.driver_category && <Badge variant="secondary">{(league as any).driver_category}</Badge>}
              </>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/ligaer/$leagueId/regler" params={{ leagueId }}>
            <Button variant="outline" size="sm" className="gap-2"><BookOpen className="h-4 w-4" /> Se regelsæt</Button>
          </Link>
          {league && <SignupDialog leagueId={leagueId} configs={configs} />}
        </div>
      </div>

      <QuickNav />

      {league && <SignupsList leagueId={leagueId} />}

      <div id="kalender">
        <h2 className="mb-2 text-lg font-semibold">Afdelinger</h2>
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen afdelinger oprettet endnu.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {divisions?.map((d: any) => {
            const slots: WeatherKey[] = Array.isArray(d.settings?.weather) ? d.settings.weather : [];
            return (
              <Link key={d.id} to="/ligaer/$leagueId/afdeling/$divisionId" params={{ leagueId, divisionId: d.id }}>
                <Card className="cursor-pointer transition hover:border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">{d.name}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      {d.track && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.track}{d.layout ? ` · ${d.layout}` : ""}</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {d.race_date && (
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" /> {format(new Date(d.race_date), "dd MMM yyyy HH:mm")}
                        </Badge>
                      )}
                      <Badge variant="outline">{d.entries?.[0]?.count ?? 0} tilmeldt</Badge>
                    </div>
                    {slots.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {slots.map((key, i) => {
                          const w = WEATHER_BY_KEY[key];
                          if (!w) return null;
                          const Icon = w.icon;
                          return <Icon key={i} className="h-4 w-4 text-muted-foreground" aria-label={w.label} />;
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useLeagueSignups(leagueId: string) {
  return useQuery({
    queryKey: ["league-signups", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("car_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function SignupsList({ leagueId }: { leagueId: string }) {
  const { data } = useLeagueSignups(leagueId);
  if (!data || data.length === 0) return null;
  const grouped = data.reduce<Record<string, typeof data>>((acc, e) => {
    const k = `${e.car_class} · ${e.driver_category}`;
    (acc[k] ??= [] as any).push(e);
    return acc;
  }, {});
  return (
    <div id="entryliste">
      <h2 className="mb-2 text-lg font-semibold">Tilmeldte kørere</h2>
      <div className="space-y-2">
        {Object.entries(grouped).map(([k, list]) => (
          <Card key={k}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{k}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {list.map((e) => (
                  <Badge key={e.id} variant="secondary">#{e.car_number} {e.driver_name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SignupDialog({ leagueId, configs }: { leagueId: string; configs: ClassConfig[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const [open, setOpen] = useState(false);
  const [cfgIdx, setCfgIdx] = useState<string>("0");
  const [carNumber, setCarNumber] = useState<number | null>(null);
  const [driverName, setDriverName] = useState("");

  const alreadySignedUp = !!user && (signups ?? []).some((s) => s.user_id === user.id);
  const selected = configs[Number(cfgIdx)];

  const { taken, available } = useMemo(() => {
    if (!selected) return { taken: [] as number[], available: [] as number[] };
    const t = (signups ?? [])
      .filter((s) => s.car_class === selected.car_class && s.driver_category === selected.driver_category && s.car_number != null)
      .map((s) => s.car_number as number);
    const a: number[] = [];
    for (let n = selected.number_from; n <= selected.number_to; n++) if (!t.includes(n)) a.push(n);
    return { taken: t, available: a };
  }, [signups, selected]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Du skal være logget ind.");
    if (!selected) return toast.error("Vælg en klasse.");
    if (carNumber == null) return toast.error("Vælg et kørenummer.");
    const { error } = await supabase.from("entries").insert({
      league_id: leagueId,
      user_id: user.id,
      driver_name: driverName.trim(),
      car_class: selected.car_class,
      driver_category: selected.driver_category,
      car_number: carNumber,
    });
    if (error) return toast.error(error.message);
    toast.success("Du er tilmeldt!");
    setOpen(false);
    setDriverName("");
    setCarNumber(null);
    qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
  };

  if (!user) {
    return <Button asChild size="sm" className="gap-2"><Link to="/login">Log ind for at tilmelde</Link></Button>;
  }
  if (configs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={alreadySignedUp}>
          <UserPlus className="h-4 w-4" /> {alreadySignedUp ? "Du er tilmeldt" : "Tilmeld dig"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tilmeld dig {league_name(leagueId)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Kørernavn</Label><Input required maxLength={80} value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
          <div>
            <Label>Bilklasse</Label>
            <Select value={cfgIdx} onValueChange={(v) => { setCfgIdx(v); setCarNumber(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {configs.map((c, i) => (
                  <SelectItem key={i} value={String(i)}>{c.car_class} · {c.driver_category} (#{c.number_from}-{c.number_to})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="space-y-2">
              <Label>Kørenummer</Label>
              <div className="grid grid-cols-8 gap-1 rounded-md border border-border p-2 max-h-48 overflow-y-auto">
                {Array.from({ length: selected.number_to - selected.number_from + 1 }, (_, i) => selected.number_from + i).map((n) => {
                  const isTaken = taken.includes(n);
                  const isSel = carNumber === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={isTaken}
                      onClick={() => setCarNumber(n)}
                      className={`rounded px-1 py-1 text-xs ${isTaken ? "bg-muted text-muted-foreground line-through cursor-not-allowed" : isSel ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{available.length} ledige · {taken.length} optaget</p>
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={carNumber == null}>Tilmeld</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickNav() {
  const items = [
    { id: "entryliste", label: "Entryliste", icon: Users },
    { id: "kalender", label: "Kalender", icon: Calendar },
    { id: "stillinger", label: "Stillinger", icon: Trophy },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center transition hover:border-primary hover:bg-accent"
        >
          <item.icon className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">{item.label}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground transition group-hover:translate-y-0.5" />
        </button>
      ))}
    </div>
  );
}

function StandingsPlaceholder() {
  return (
    <div id="stillinger" className="space-y-2">
      <h2 className="text-lg font-semibold">Stillinger</h2>
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Stillinger vises når der er afholdt løb.
        </CardContent>
      </Card>
    </div>
  );
}

function league_name(_id: string) {
  return "ligaen";
}
