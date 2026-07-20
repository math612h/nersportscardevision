import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Calendar as CalIcon, CheckCircle2, Clock, Copy, Check, MapPin, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { COACHING_FOCUS_POINTS, COACHING_DURATIONS } from "@/lib/coaching-focus-points";
import { listCoaches, getCoachAvailableDays, getCoachSlots, createCoachingBooking, type CoachListItem } from "@/lib/coaching.functions";
import { LMU_TRACKS } from "@/lib/tracks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/book")({
  component: BookCoachingPage,
});

type Step = 1 | 2 | 3 | 4 | 5 | 6;

function BookCoachingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [focus, setFocus] = useState<string[]>([]);
  const [coach, setCoach] = useState<CoachListItem | null>(null);
  const [viewingCoach, setViewingCoach] = useState<CoachListItem | null>(null);
  const [duration, setDuration] = useState<30 | 45 | 60>(45);
  const [track, setTrack] = useState<string>("");
  const [layout, setLayout] = useState<string>("");
  const [day, setDay] = useState<string>(""); // YYYY-MM-DD
  const [slot, setSlot] = useState<string>(""); // ISO
  const [extra, setExtra] = useState("");
  const [calCursor, setCalCursor] = useState(() => new Date());

  const coachesFn = useServerFn(listCoaches);
  const daysFn = useServerFn(getCoachAvailableDays);
  const slotsFn = useServerFn(getCoachSlots);
  const createFn = useServerFn(createCoachingBooking);

  const { data: coaches = [] } = useQuery({ queryKey: ["coaches"], queryFn: () => coachesFn() });

  const sortedCoaches = useMemo(() => {
    const list = [...coaches] as CoachListItem[];
    list.sort((a, b) => matchCount(b, focus) - matchCount(a, focus));
    return list;
  }, [coaches, focus]);

  const trackInfo = LMU_TRACKS.find((t) => t.name === track);

  const { data: availableDays = [] } = useQuery({
    queryKey: ["coach-days", coach?.user_id, calCursor.getFullYear(), calCursor.getMonth(), duration],
    queryFn: () => daysFn({ data: { coach_user_id: coach!.user_id, year: calCursor.getFullYear(), month: calCursor.getMonth(), duration_minutes: duration } }),
    enabled: !!coach && step >= 5,
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["coach-slots", coach?.user_id, day, duration],
    queryFn: () => slotsFn({ data: { coach_user_id: coach!.user_id, date: day, duration_minutes: duration } }),
    enabled: !!coach && !!day,
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {
      coach_user_id: coach!.user_id,
      focus_points: focus,
      duration_minutes: duration,
      track,
      layout: layout || null,
      starts_at: slot,
      extra_info: extra || null,
    } }),
    onSuccess: () => {
      toast.success("Booking sendt! Coachen får en besked på Discord.");
      qc.invalidateQueries({ queryKey: ["my-coaching-bookings"] });
      navigate({ to: "/coaching/mine-bookinger" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = (() => {
    if (step === 1) return focus.length > 0;
    if (step === 2) return !!coach;
    if (step === 3) return true;
    if (step === 4) return !!track;
    if (step === 5) return !!slot;
    return true;
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/coaching"><ArrowLeft className="mr-1 h-4 w-4" /> Tilbage</Link>
        </Button>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className={cn("h-2 w-8 rounded-full", n <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      {/* Step 1: focus points */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold">Hvad vil du gerne have hjælp til?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vælg ét eller flere fokuspunkter.</p>
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

      {/* Step 2: choose coach */}
      {step === 2 && !viewingCoach && (
        <div>
          <h1 className="text-2xl font-bold">Vælg en coach</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sorteret efter bedste match.</p>
          {sortedCoaches.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Ingen aktive coaches lige nu.</p>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sortedCoaches.map((c) => {
              const m = matchCount(c, focus);
              return (
                <Card key={c.user_id} className="overflow-hidden">
                  <CardContent className="pt-6">
                    <button type="button" onClick={() => setViewingCoach(c)} className="flex w-full items-start gap-3 text-left">
                      <Avatar className="h-12 w-12">
                        {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                        <AvatarFallback>{c.display_name?.[0] ?? "C"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{c.display_name}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{c.bio || "Coach hos LMU Danmark"}</div>
                      </div>
                    </button>
                    {focus.length > 0 && (
                      <p className={cn("mt-3 text-xs font-medium", m > 0 ? "text-emerald-500" : "text-muted-foreground")}>
                        {m} ud af dine {focus.length} valgte fokuspunkter matcher denne coach
                      </p>
                    )}
                    <Button size="sm" className="mt-3 w-full" onClick={() => { setCoach(c); setStep(3); }}>
                      Vælg coach
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && viewingCoach && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setViewingCoach(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Tilbage til coaches
          </Button>
          <div className="mt-4 flex items-start gap-4">
            <Avatar className="h-20 w-20">
              {viewingCoach.avatar_url && <AvatarImage src={viewingCoach.avatar_url} />}
              <AvatarFallback className="text-2xl">{viewingCoach.display_name?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{viewingCoach.display_name}</h1>
              {focus.length > 0 && (
                <p className="mt-1 text-sm text-emerald-500">
                  {matchCount(viewingCoach, focus)} ud af dine {focus.length} valgte fokuspunkter matcher
                </p>
              )}
            </div>
          </div>
          {viewingCoach.bio && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">Bio</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{viewingCoach.bio}</p>
            </div>
          )}
          {viewingCoach.specialties.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">Specialer</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {viewingCoach.specialties.map((s) => (
                  <Badge key={s} variant={focus.includes(s) ? "default" : "secondary"}>{s}</Badge>
                ))}
              </div>
            </div>
          )}
          {viewingCoach.achievements.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">Achievements</h3>
              <ul className="mt-2 list-inside list-disc text-sm">
                {viewingCoach.achievements.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          <Button className="mt-8" onClick={() => { setCoach(viewingCoach); setViewingCoach(null); setStep(3); }}>
            Vælg {viewingCoach.display_name} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 3: duration */}
      {step === 3 && (
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

      {/* Step 4: track + layout */}
      {step === 4 && (
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

      {/* Step 5: pick date + slot */}
      {step === 5 && coach && (
        <div>
          <h1 className="text-2xl font-bold">Vælg tidspunkt</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grønne dage = {coach.display_name} har ledige tider. Klik en dag for at se tidsrum.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <MonthCalendar
              cursor={calCursor}
              setCursor={setCalCursor}
              availableDays={availableDays}
              selected={day}
              onPick={(d) => { setDay(d); setSlot(""); }}
            />
            <div>
              <h3 className="mb-2 text-sm font-semibold">Ledige tider</h3>
              {!day && <p className="text-sm text-muted-foreground">Vælg en dag i kalenderen.</p>}
              {day && slots.length === 0 && <p className="text-sm text-muted-foreground">Ingen ledige tidsrum denne dag.</p>}
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => {
                  const d = new Date(s);
                  const label = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        slot === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 6: extra + confirm */}
      {step === 6 && coach && (
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

          <MobilePayBox amount={duration === 30 ? 30 : duration === 45 ? 40 : 50} />


          <div className="mt-6">
            <label className="mb-1 flex items-center gap-1 text-sm font-medium"><MessageSquare className="h-4 w-4" /> Ekstra info (valgfri)</label>
            <Textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Fx: 'Jeg har specifikt problemer med sektor 2 i Eau Rouge…'" />
          </div>

          <Button className="mt-6 w-full" size="lg" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            BOOK tid med {coach.display_name}
          </Button>
        </div>
      )}

      {/* Nav buttons */}
      {step < 6 && !viewingCoach && (
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

function matchCount(c: CoachListItem, focus: string[]) {
  if (!focus.length) return 0;
  return focus.filter((f) => c.specialties.includes(f)).length;
}

function MobilePayBox({ amount }: { amount: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText("4412ZQ");
    setCopied(true);
    toast.success("MobilePay-boks kopieret");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card className="mt-6">
      <CardContent className="space-y-3 pt-6">
        <div className="text-sm font-semibold">Betaling via MobilePay</div>
        <p className="text-sm text-muted-foreground">
          Send <strong>{amount} kr.</strong> til vores MobilePay-boks. Skriv gerne dit LMU-navn og
          "coaching" i beskeden.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
          <span className="text-2xl font-bold tracking-widest">4412ZQ</span>
          <Button size="sm" variant="outline" onClick={copy} className="ml-auto" type="button">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1">{copied ? "Kopieret" : "Kopiér"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
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
