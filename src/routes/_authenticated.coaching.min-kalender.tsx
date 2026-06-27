import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMyBookingsAsCoach } from "@/lib/coaching.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/min-kalender")({
  component: CoachCalendarPage,
});

function CoachCalendarPage() {
  const listFn = useServerFn(listMyBookingsAsCoach);
  const { data: bookings = [] } = useQuery({ queryKey: ["coach-bookings"], queryFn: () => listFn() });
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openBooking, setOpenBooking] = useState<any | null>(null);

  const bookedDays = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of bookings as any[]) {
      if (b.status === "cancelled" || b.status === "rejected") continue;
      const d = new Date(b.starts_at);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = map.get(iso) ?? [];
      arr.push(b);
      map.set(iso, arr);
    }
    return map;
  }, [bookings]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const monthName = first.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
  const days = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/coaching/min-profil"><ArrowLeft className="mr-1 h-4 w-4" /> Min profil</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold">Min coach-kalender</h1>
      <p className="mt-1 text-sm text-muted-foreground">Grønne dage har bookinger. Klik en dag for at se sessionerne.</p>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹ Forrige</Button>
            <div className="font-semibold capitalize">{monthName}</div>
            <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>Næste ›</Button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
            {days.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const list = bookedDays.get(iso);
              const has = !!list && list.length > 0;
              const isSel = selectedDay === iso;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!has}
                  onClick={() => setSelectedDay(iso)}
                  className={cn(
                    "aspect-square rounded-lg border p-2 text-left text-sm transition-colors",
                    !has && "border-border/40 text-muted-foreground/60",
                    has && !isSel && "border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25",
                    isSel && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  <div className="font-semibold">{d.getDate()}</div>
                  {has && <div className="text-xs">{list!.length} session{list!.length > 1 ? "er" : ""}</div>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDay && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <h3 className="font-semibold">{new Date(selectedDay).toLocaleDateString("da-DK", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</h3>
            <div className="mt-3 space-y-2">
              {(bookedDays.get(selectedDay) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((b: any) => (
                <button key={b.id} type="button" onClick={() => setOpenBooking(b)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent">
                  <div>
                    <div className="font-medium">{new Date(b.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })} — {b.user?.display_name ?? "Bruger"}</div>
                    <div className="text-xs text-muted-foreground">{b.duration_minutes} min · {b.track}{b.layout ? ` — ${b.layout}` : ""}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {openBooking && (
        <BookingDetail booking={openBooking} onClose={() => setOpenBooking(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Afventer dig", variant: "outline" },
    confirmed: { label: "Bekræftet", variant: "default" },
    rejected: { label: "Afvist", variant: "destructive" },
    cancelled: { label: "Aflyst", variant: "secondary" },
    completed: { label: "Færdig", variant: "secondary" },
  };
  const m = map[status] ?? map.pending;
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function BookingDetail({ booking, onClose }: { booking: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-6 text-sm">
          <h3 className="text-lg font-bold">Booking-detaljer</h3>
          <div><strong>Bruger:</strong> {booking.user?.display_name ?? "Bruger"}</div>
          <div><strong>Tid:</strong> {new Date(booking.starts_at).toLocaleString("da-DK", { dateStyle: "full", timeStyle: "short" })}</div>
          <div><strong>Varighed:</strong> {booking.duration_minutes} min</div>
          <div><strong>Bane:</strong> {booking.track}{booking.layout ? ` — ${booking.layout}` : ""}</div>
          <div><strong>Status:</strong> <StatusBadge status={booking.status} /></div>
          <div>
            <strong>Fokuspunkter:</strong>
            <div className="mt-1 flex flex-wrap gap-1">
              {(booking.focus_points ?? []).map((f: string) => <Badge key={f} variant="secondary">{f}</Badge>)}
            </div>
          </div>
          {booking.extra_info && (
            <div>
              <strong>Brugerens noter:</strong>
              <p className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{booking.extra_info}</p>
            </div>
          )}
          {booking.rejection_reason && (
            <div>
              <strong>Afvist begrundelse:</strong>
              <p className="mt-1 whitespace-pre-wrap text-xs text-destructive">{booking.rejection_reason}</p>
            </div>
          )}
          {booking.status === "pending" && (
            <p className="rounded border border-primary/30 bg-primary/5 p-2 text-xs">
              Bekræft eller afvis denne booking via den Discord-besked vi har sendt dig.
            </p>
          )}
          <div className="pt-2">
            <Button variant="outline" className="w-full" onClick={onClose}>Luk</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
