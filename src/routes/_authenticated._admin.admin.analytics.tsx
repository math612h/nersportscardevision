import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BarChart3, Users, MousePointerClick, Clock, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { getAdminAnalytics } from "@/lib/analytics-admin.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/analytics")({
  component: AdminAnalyticsPage,
});

const RANGES = [
  { value: "7", label: "Seneste 7 dage" },
  { value: "14", label: "Seneste 14 dage" },
  { value: "30", label: "Seneste 30 dage" },
  { value: "60", label: "Seneste 60 dage" },
  { value: "90", label: "Seneste 90 dage" },
];

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function StatCard({ title, value, icon: Icon, hint }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function AdminAnalyticsPage() {
  const [days, setDays] = useState("7");
  const fetchAnalytics = useServerFn(getAdminAnalytics);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => fetchAnalytics({ data: { days: Number(days) } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="ml-auto">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Egen tracking af sidevisninger, klik og tid pr. session — dækker både gæster og indloggede brugere. Admin-sider tælles ikke med.
      </p>

      {error && <p className="text-sm text-destructive">Kunne ikke hente data: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Besøgende" value={data.totals.visitors} icon={Users} hint={`${data.totals.signed_in_users} indloggede`} />
            <StatCard title="Sidevisninger" value={data.totals.pageviews} icon={Eye} hint={`${data.totals.avg_pageviews_per_session} pr. session`} />
            <StatCard title="Klik" value={data.totals.clicks} icon={MousePointerClick} hint={`${data.totals.avg_clicks_per_session} pr. session`} />
            <StatCard title="Snit-tid pr. session" value={formatDuration(data.totals.avg_session_duration_sec)} icon={Clock} hint={`${data.totals.sessions} sessioner`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trafik over tid</CardTitle>
              <CardDescription>Sidevisninger og unikke besøgende pr. dag</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line type="monotone" dataKey="pageviews" stroke="hsl(var(--primary))" strokeWidth={2} name="Sidevisninger" />
                  <Line type="monotone" dataKey="visitors" stroke="hsl(var(--chart-2, 173 58% 39%))" strokeWidth={2} name="Besøgende" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Engagement pr. dag</CardTitle>
                <CardDescription>Klik og snit-tid pr. session (sekunder)</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                    <Bar dataKey="clicks" fill="hsl(var(--primary))" name="Klik" />
                    <Bar dataKey="avg_duration_sec" fill="hsl(var(--chart-3, 43 74% 66%))" name="Snit-tid (s)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mest besøgte sider</CardTitle>
                <CardDescription>Top 15 i perioden</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.topPages.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ingen data endnu.</p>
                  )}
                  {data.topPages.map((p) => {
                    const max = data.topPages[0].count;
                    const pct = Math.max(2, Math.round((p.count / max) * 100));
                    return (
                      <div key={p.path} className="relative rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm">
                        <div className="absolute inset-y-0 left-0 rounded-md bg-primary/15" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs">{p.path}</span>
                          <span className="tabular-nums text-muted-foreground">{p.count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
