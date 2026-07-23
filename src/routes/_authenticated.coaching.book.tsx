import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Calendar as CalIcon, CheckCircle2, Clock, MapPin, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { COACHING_FOCUS_POINTS, COACHING_DURATIONS } from "@/lib/coaching-focus-points";
import { getAllCoachesAvailableDays, getAllCoachesSlots, type AggregatedSlot } from "@/lib/coaching.functions";
import { createCoachingCheckout } from "@/lib/payments.functions";
import { getStripeEnvironment, hasStripeConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckoutBox } from "@/components/StripeEmbeddedCheckoutBox";
import { LMU_TRACKS } from "@/lib/tracks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/book")({
  component: BookCoachingPage,
});

type Step = 1 | 2 | 3 | 4 | 5;

type SelectedCoach = { user_id: string; display_name: string; avatar_url: string | null };

function BookCoachingPage() {
  const _navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [focus, setFocus] = useState<string[]>([]);
  const [duration, setDuration] = useState<30 | 45 | 60>(45);
  const [track, setTrack] = useState<string>("");
  const [layout, setLayout] = useState<string>("");
  const [day, setDay] = useState<string>(""); // YYYY-MM-DD
  const [slot, setSlot] = useState<string>(""); // ISO
  const [coach, setCoach] = useState<SelectedCoach | null>(null);
  const [extra, setExtra] = useState("");
  const [calCursor, setCalCursor] = useState(() => new Date());

  const daysFn = useServerFn(getAllCoachesAvailableDays);
  const slotsFn = useServerFn(getAllCoachesSlots);
  const checkoutFn = useServerFn(createCoachingCheckout);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);

  const trackInfo = LMU_TRACKS.find((t) => t.name === track);

  const { data: availableDays = [] } = useQuery({
    queryKey: ["all-coach-days", calCursor.getFullYear(), calCursor.getMonth(), duration],
    queryFn: () => daysFn({ data: { year: calCursor.getFullYear(), month: calCursor.getMonth(), duration_minutes: duration } }),
    enabled: step >= 4,
  });

  const { data: slots = [] } = useQuery<AggregatedSlot[]>({
    queryKey: ["all-coach-slots", day, duration],
    queryFn: () => slotsFn({ data: { date: day, duration_minutes: duration } }),
    enabled: !!day,
  });

  const selectedSlot = useMemo(() => slots.find((s) => s.starts_at === slot), [slots, slot]);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const result = await checkoutFn({
      data: {
        coach_user_id: coach!.user_id,
        focus_points: focus,
        duration_minutes: duration,
        track,
        layout: layout || null,
        starts_at: slot,
        extra_info: extra || null,
        returnUrl: `${window.location.origin}/coaching/mine-bookinger?paid=1`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Stripe returnerede intet client secret");
    return result.clientSecret;
  }, [checkoutFn, coach, focus, duration, track, layout, slot, extra]);

  const startCheckout = () => {
    if (!hasStripeConfigured()) {
      toast.error("Betaling er ikke konfigureret endnu. Kontakt en admin.");
      return;
    }
    setCheckoutSecret("loading");
  };

  const canNext = (() => {
    if (step === 1) return focus.length > 0;
    if (step === 2) return true;
    if (step === 3) return !!track;
    if (step === 4) return !!slot && !!coach;
    return true;
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/coaching"><ArrowLeft className="mr-1 h-4 w-4" /> Tilbage</Link>
        </Button>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={cn("h-2 w-8 rounded-full", n <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      {/* Step 1: focus points */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold">Hvad vil du gerne have hjælp til?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vælg mellem 1-3 fokuspunkter. Jo færre fokuspunkter, jo mere dybdegående kan vi gå.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {COACHING_FOCUS_POINTS.map((fp) => {
              const sel = focus.includes(fp);
              return (
                <button
                  key={fp}
                  type="button"
                  onClick={() => setFocus((cur) => sel ? cur.filter((f) => f !== fp) : [...cur, fp])}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                  )}
                >
                  {sel && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
                  {fp}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: duration */}
      {step === 2 && (
        <div>
          <h1 className="text-2xl font-bold">Hvor lang en session?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jo flere fokuspunkter du har valgt, desto længere tid anbefales. Coachen når kun det, der er tid til.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Du har valgt <strong>{focus.length}</strong> fokuspunkter.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {COACHING_DURATIONS.map((d) => {
              const price = d === 30 ? 30 : d === 45 ? 40 : 50;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    "rounded-xl border p-6 text-center transition-colors",
                    duration === d ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  )}
                >
                  <Clock className="mx-auto h-6 w-6 text-primary" />
                  <div className="mt-2 text-2xl font-bold">{d} min</div>
                  <div className="mt-1 text-sm font-medium text-primary">{price} kr.</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: track + layout */}
      {step === 3 && (
        <div>
          <h1 className="text-2xl font-bold">Hvilken bane?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vælg den bane sessionen skal handle om.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Bane</label>
              <Select value={track} onValueChange={(v) => { setTrack(v); setLayout(""); }}>
                <SelectTrigger><SelectValue placeholder="Vælg bane" /></SelectTrigger>
                <SelectContent>
                  {LMU_TRACKS.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Layout</label>
              <Select value={layout} onValueChange={setLayout} disabled={!trackInfo}>
                <SelectTrigger><SelectValue placeholder={trackInfo ? "Vælg layout" : "Vælg bane først"} /></SelectTrigger>
                <SelectContent>
                  {trackInfo?.layouts.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: calendar → slot → coach */}
      {step === 4 && (
        <div>
          <h1 className="text-2xl font-bold">Vælg tidspunkt</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grønne dage har mindst én coach ledig. Klik en dag for at se ledige tidsrum — og hvilke coaches der tilbyder dem.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <MonthCalendar
              cursor={calCursor}
              setCursor={setCalCursor}
              availableDays={availableDays}
              selected={day}
              onPick={(d) => { setDay(d); setSlot(""); setCoach(null); }}
            />
            <div>
              <h3 className="mb-2 text-sm font-semibold">Ledige tider</h3>
              {!day && <p className="text-sm text-muted-foreground">Vælg en dag i kalenderen.</p>}
              {day && slots.length === 0 && <p className="text-sm text-muted-foreground">Ingen ledige tidsrum denne dag.</p>}
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => {
                  const d = new Date(s.starts_at);
                  const label = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
                  const isSel = slot === s.starts_at;
                  return (
                    <button
                      key={s.starts_at}
                      type="button"
                      onClick={() => { setSlot(s.starts_at); setCoach(s.coaches.length === 1 ? s.coaches[0] : null); }}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        isSel ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                      )}
                      title={`${s.coaches.length} coach${s.coaches.length === 1 ? "" : "es"} ledig`}
                    >
                      {label}
                      <span className="ml-1 text-[10px] opacity-75">({s.coaches.length})</span>
                    </button>
                  );
                })}
              </div>

              {selectedSlot && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold">
                    {selectedSlot.coaches.length === 1 ? "Coach" : "Vælg coach"}
                  </h3>
                  <div className="space-y-2">
                    {selectedSlot.coaches.map((c) => {
                      const sel = coach?.user_id === c.user_id;
                      return (
                        <button
                          key={c.user_id}
                          type="button"
                          onClick={() => setCoach(c)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                            sel ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                          )}
                        >
                          <Avatar className="h-9 w-9">
                            {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                            <AvatarFallback>{c.display_name?.[0] ?? "C"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-sm font-medium">{c.display_name}</div>
                          {sel && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 5: extra + confirm */}
      {step === 5 && coach && (
        <div>
          <h1 className="text-2xl font-bold">Sidste detaljer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Skriv eventuelt noget coachen bør vide.</p>

          <Card className="mt-6">
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><strong>Coach:</strong> {coach.display_name}</div>
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><strong>Varighed:</strong> {duration} min ({duration === 30 ? 30 : duration === 45 ? 40 : 50} kr.)</div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><strong>Bane:</strong> {track}{layout ? ` — ${layout}` : ""}</div>
              <div className="flex items-center gap-2"><CalIcon className="h-4 w-4 text-primary" /><strong>Tid:</strong> {slot ? new Date(slot).toLocaleString("da-DK", { dateStyle: "full", timeStyle: "short" }) : ""}</div>
              <div>
                <strong>Fokuspunkter:</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {focus.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            <label className="mb-1 flex items-center gap-1 text-sm font-medium"><MessageSquare className="h-4 w-4" /> Ekstra info (valgfri)</label>
            <Textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Fx: 'Jeg har specifikt problemer med sektor 2 i Eau Rouge…'" />
          </div>

          <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p>Betaling foregår sikkert via kort eller MobilePay. Din booking sendes først til coachen når betalingen er gennemført — coachen bekræfter derefter tid, server-navn, server-kode og kommunikationskanal på Discord.</p>
            <p className="mt-2">Serveren sættes op specifikt til din session — det er inkluderet i prisen.</p>
          </div>

          {!checkoutSecret && (
            <Button className="mt-6 w-full" size="lg" onClick={startCheckout}>
              Betal {duration === 30 ? 30 : duration === 45 ? 40 : 50} kr. og book
            </Button>
          )}

          {checkoutSecret && (
            <div className="mt-6">
              <StripeEmbeddedCheckoutBox fetchClientSecret={fetchClientSecret} />
              <Button variant="ghost" className="mt-3 w-full" onClick={() => setCheckoutSecret(null)}>
                Annullér betaling
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Nav buttons */}
      {step < 5 && (
        <div className="mt-10 flex justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Forrige
          </Button>
          <Button disabled={!canNext} onClick={() => setStep((s) => (s + 1) as Step)}>
            Næste <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function MonthCalendar({
  cursor, setCursor, availableDays, selected, onPick,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  availableDays: string[];
  selected: string;
  onPick: (iso: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const monthName = first.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
  const days = ["M", "T", "O", "T", "F", "L", "S"];
  const availSet = new Set(availableDays);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</Button>
        <div className="text-sm font-semibold capitalize">{monthName}</div>
        <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {days.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const past = d < today;
          const avail = availSet.has(iso);
          const isSel = selected === iso;
          return (
            <button
              key={i}
              type="button"
              disabled={past || !avail}
              onClick={() => onPick(iso)}
              className={cn(
                "aspect-square rounded text-sm transition-colors",
                past && "text-muted-foreground/40",
                !past && !avail && "text-muted-foreground",
                avail && !isSel && "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
                isSel && "bg-primary text-primary-foreground",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
