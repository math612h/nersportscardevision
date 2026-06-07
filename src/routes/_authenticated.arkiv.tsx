import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getMyArchive } from "@/lib/rating.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/arkiv")({
  head: () => ({ meta: [{ title: "Mit arkiv – DanishEnduranceSeries.dk" }] }),
  component: ArchivePage,
});

function fmtLap(ms: number | null | undefined) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000));
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
}

function sourceBadge(src: string) {
  if (src === "league") return <Badge variant="default">Liga</Badge>;
  if (src === "admin") return <Badge variant="secondary">Officiel</Badge>;
  return <Badge variant="outline">Daily</Badge>;
}

function ArchivePage() {
  const { user } = useAuth();
  const fetchArchive = useServerFn(getMyArchive);
  const { data, isLoading } = useQuery({
    queryKey: ["my-archive", user?.id],
    enabled: !!user,
    queryFn: () => fetchArchive(),
  });

  const [chartClass, setChartClass] = useState<string>("ALL");
  const [chartTrack, setChartTrack] = useState<string>("ALL");

  const classes = useMemo(
    () => Array.from(new Set((data?.history ?? []).map((h) => h.car_class))).sort(),
    [data],
  );
  const tracks = useMemo(
    () => Array.from(new Set((data?.history ?? []).map((h) => h.track))).sort(),
    [data],
  );

  const chartData = useMemo(() => {
    const rows = (data?.history ?? [])
      .filter((h) => (chartClass === "ALL" || h.car_class === chartClass))
      .filter((h) => (chartTrack === "ALL" || h.track === chartTrack))
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    // For chart: show best-so-far (running min) for clarity
    let runMin = Infinity;
    return rows.map((r) => {
      runMin = Math.min(runMin, r.best_lap_ms);
      return {
        date: new Date(r.recorded_at).toLocaleDateString("da-DK"),
        lap: r.best_lap_ms / 1000,
        best: runMin / 1000,
      };
    });
  }, [data, chartClass, chartTrack]);

  if (isLoading) return <div className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">Indlæser…</div>;

  const best = data?.best ?? [];
  const leagueResults = data?.leagueResults ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mit arkiv</h1>
          <p className="text-sm text-muted-foreground">Din udvikling og personlige bedste tider.</p>
        </div>
        <Link to="/profil" className="text-sm text-muted-foreground hover:underline">← Tilbage til profil</Link>
      </div>

      <Tabs defaultValue="best">
        <TabsList>
          <TabsTrigger value="best">Bedste tider</TabsTrigger>
          <TabsTrigger value="curve">Udvikling</TabsTrigger>
          <TabsTrigger value="leagues">Liga-historik</TabsTrigger>
        </TabsList>

        <TabsContent value="best">
          <Card>
            <CardHeader>
              <CardTitle>Bedste rundetider pr. kombination</CardTitle>
              <CardDescription>Din hurtigste runde pr. bane og bilklasse, uanset session.</CardDescription>
            </CardHeader>
            <CardContent>
              {best.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen tider endnu. Brug companion-appen eller deltag i et løb.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bane</TableHead>
                      <TableHead>Klasse</TableHead>
                      <TableHead>Bil</TableHead>
                      <TableHead>Bedste runde</TableHead>
                      <TableHead>Kilde</TableHead>
                      <TableHead>Sat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {best.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{b.track}{b.layout ? ` (${b.layout})` : ""}</TableCell>
                        <TableCell>{b.car_class}</TableCell>
                        <TableCell className="text-muted-foreground">{b.car_model ?? "—"}</TableCell>
                        <TableCell className="font-mono">{fmtLap(b.best_lap_ms)}</TableCell>
                        <TableCell>{sourceBadge(b.source)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {b.recorded_at ? new Date(b.recorded_at).toLocaleDateString("da-DK") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curve">
          <Card>
            <CardHeader>
              <CardTitle>Udviklingskurve</CardTitle>
              <CardDescription>Hver runde du har sat, og din løbende personlige bedste.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Select value={chartClass} onValueChange={setChartClass}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Alle klasser</SelectItem>
                    {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={chartTrack} onValueChange={setChartTrack}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Alle baner</SelectItem>
                    {tracks.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen data for valget.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} reversed />
                      <Tooltip formatter={(v: number) => `${v.toFixed(3)} s`} />
                      <Line type="monotone" dataKey="lap" stroke="hsl(var(--muted-foreground))" dot={false} name="Runde (s)" />
                      <Line type="monotone" dataKey="best" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Personlig bedste" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leagues">
          <Card>
            <CardHeader>
              <CardTitle>Liga-resultater</CardTitle>
              <CardDescription>Dine officielle løbsresultater fra ligaerne.</CardDescription>
            </CardHeader>
            <CardContent>
              {leagueResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen liga-resultater endnu.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dato</TableHead>
                      <TableHead>Liga</TableHead>
                      <TableHead>Runde</TableHead>
                      <TableHead>Bane</TableHead>
                      <TableHead>Klasse</TableHead>
                      <TableHead>Placering</TableHead>
                      <TableHead>Point</TableHead>
                      <TableHead>Bedste runde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leagueResults.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString("da-DK")}</TableCell>
                        <TableCell className="font-medium">
                          <Link to="/ligaer/$leagueId" params={{ leagueId: r.league_id }} className="hover:underline">
                            {r.league_name}
                          </Link>
                        </TableCell>
                        <TableCell>{r.round ?? "—"}</TableCell>
                        <TableCell>{r.track}</TableCell>
                        <TableCell>{r.car_class}</TableCell>
                        <TableCell className="font-medium">{r.position ?? "—"}</TableCell>
                        <TableCell>{r.points != null ? Math.floor(Number(r.points)) : "—"}</TableCell>
                        <TableCell className="font-mono">{fmtLap(r.best_lap_ms)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
