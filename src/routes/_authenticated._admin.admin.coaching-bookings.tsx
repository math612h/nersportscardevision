import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Clock, MapPin, StickyNote, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { adminListCoachingBookings } from "@/lib/coaching.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_admin/admin/coaching-bookings")({
  head: () => ({
    meta: [
      { title: "Coaching bookinger – Admin" },
      { name: "description", content: "Overblik over alle coaching bookinger på LMU Danmark." },
    ],
  }),
  component: AdminCoachingBookingsPage,
});

type Booking = {
  id: string;
  starts_at: string;
  duration_minutes: number;
  track: string;
  layout: string | null;
  focus_points: string[];
  extra_info: string | null;
  status: string;
  amount_dkk: number | null;
  rejection_reason: string | null;
  coach: { id: string; display_name: string; avatar_url: string | null } | null;
  user: { id: string; display_name: string; avatar_url: string | null } | null;
};

function statusMeta(status: string) {
  switch (status) {
    case "confirmed":
      return { label: "Bekræftet af coach", variant: "default" as const, Icon: CheckCircle2, className: "bg-emerald-600 hover:bg-emerald-600" };
    case "pending":
      return { label: "Afventer bekræftelse", variant: "secondary" as const, Icon: HelpCircle, className: "" };
    case "rejected":
      return { label: "Afvist", variant: "destructive" as const, Icon: XCircle, className: "" };
    case "cancelled":
      return { label: "Annulleret", variant: "outline" as const, Icon: XCircle, className: "" };
    case "completed":
      return { label: "Gennemført", variant: "default" as const, Icon: CheckCircle2, className: "" };
    default:
      return { label: status, variant: "outline" as const, Icon: HelpCircle, className: "" };
  }
}

function AdminCoachingBookingsPage() {
  const fn = useServerFn(adminListCoachingBookings);
  const { data = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["admin-coaching-bookings"],
    queryFn: () => fn() as any,
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (!q) return true;
      return (
        b.coach?.display_name.toLowerCase().includes(q) ||
        b.user?.display_name.toLowerCase().includes(q) ||
        b.track.toLowerCase().includes(q)
      );
    });
  }, [data, search, status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coaching bookinger</h1>
        <p className="text-sm text-muted-foreground">Overblik over alle bookede coaching sessioner.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Søg efter coach, kunde eller bane…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statusser</SelectItem>
            <SelectItem value="pending">Afventer bekræftelse</SelectItem>
            <SelectItem value="confirmed">Bekræftet af coach</SelectItem>
            <SelectItem value="completed">Gennemført</SelectItem>
            <SelectItem value="rejected">Afvist</SelectItem>
            <SelectItem value="cancelled">Annulleret</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Henter bookinger…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen bookinger fundet.</p>
      )}

      <div className="grid gap-3">
        {filtered.map((b) => {
          const s = statusMeta(b.status);
          const starts = new Date(b.starts_at);
          return (
            <Card key={b.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {b.coach?.avatar_url && <AvatarImage src={b.coach.avatar_url} />}
                      <AvatarFallback>{b.coach?.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">
                        Coach: {b.coach?.display_name ?? "Ukendt"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Booket af {b.user?.display_name ?? "Ukendt"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={s.variant} className={s.className}>
                    <s.Icon className="mr-1 h-3.5 w-3.5" />
                    {s.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {starts.toLocaleString("da-DK", { dateStyle: "full", timeStyle: "short" })}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {b.duration_minutes} minutter
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {b.track}{b.layout ? ` – ${b.layout}` : ""}
                </div>
                {b.focus_points?.length > 0 && (
                  <div className="flex flex-wrap gap-1 sm:col-span-2">
                    {b.focus_points.map((f) => (
                      <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                )}
                {b.extra_info && (
                  <div className="flex items-start gap-2 rounded border border-border bg-muted/40 p-2 sm:col-span-2">
                    <StickyNote className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Note fra bruger</p>
                      <p className="whitespace-pre-wrap">{b.extra_info}</p>
                    </div>
                  </div>
                )}
                {b.rejection_reason && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 sm:col-span-2">
                    <p className="text-xs font-medium text-destructive">Afvisningsårsag</p>
                    <p>{b.rejection_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
