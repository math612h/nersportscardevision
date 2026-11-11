import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { deleteRule, listApprovals, listFinanceAudit, listPeriods, listRules, recordApproval, runStripeAction, saveRule, setPeriodLock, upsertPeriod } from "@/lib/finance/finance.functions";
import { listBankAccounts } from "@/lib/finance/bank.functions";
import { annualReportPdf, createFullBackup, exportCsv, getReportData, runRestoreTest } from "@/lib/finance/export.functions";
import { reconcileStripe } from "@/lib/finance/reconcile";
import { CATEGORY_LABEL } from "@/lib/finance/accounts";
import { dkk, downloadBase64, downloadText, StatusBadge, useAction } from "./shared";
import { useOverview } from "./OverviewTab";
import { DocPicker } from "./DocPicker";
import { AlertTriangle } from "lucide-react";

export function ReportsTab() {
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(`${y}-12-31`);
  const fn = useServerFn(getReportData);
  const { data } = useQuery({ queryKey: ["fin", "report", from, to], queryFn: () => fn({ data: { from, to } }) });
  const csv = useServerFn(exportCsv);
  const pdf = useServerFn(annualReportPdf);
  const acc = (data?.accounts ?? []) as any[];
  const sum = (t: string, src: Record<string, number>) => acc.filter((a) => a.type === t).reduce((s, a) => s + (src[a.code] ?? 0), 0);
  const income = -sum("income", data?.period ?? {}), expense = sum("expense", data?.period ?? {});
  const row = (a: any, v: number) => v ? <div key={a.code} className="flex justify-between"><span>{a.code} {a.name}</span><span className="tabular-nums">{dkk(v)}</span></div> : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label>Fra</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Til</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(["journal", "accounts", "documents"] as const).map((k) => (
          <Button key={k} variant="outline" onClick={async () => { const r = await csv({ data: { kind: k, from, to } }); downloadText(r.filename, r.csv); }}>
            {k === "journal" ? "Kassekladde CSV" : k === "accounts" ? "Kontospecifikation CSV" : "Bilagsoversigt CSV"}
          </Button>
        ))}
        <Button variant="outline" onClick={async () => { try { const r = await pdf({ data: { year: Number(from.slice(0, 4)) } }); downloadBase64(r.filename, r.base64, "application/pdf"); } catch (e) { toast.error((e as Error).message); } }}>Årsregnskab PDF</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Resultatopgørelse</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">Indtægter</div>{acc.filter((a) => a.type === "income").map((a) => row(a, -(data?.period?.[a.code] ?? 0)))}
            <div className="pt-2 font-medium">Udgifter</div>{acc.filter((a) => a.type === "expense").map((a) => row(a, data?.period?.[a.code] ?? 0))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Resultat</span><span className="tabular-nums">{dkk(income - expense)}</span></div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Balance pr. {to}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">Aktiver</div>{acc.filter((a) => a.type === "asset").map((a) => row(a, data?.closing?.[a.code] ?? 0))}
            <div className="pt-2 font-medium">Forpligtelser og egenkapital</div>{acc.filter((a) => a.type === "liability" || a.type === "equity").map((a) => row(a, -(data?.closing?.[a.code] ?? 0)))}
            <div className="flex justify-between border-t border-border pt-2"><span>Årets resultat (ikke overført)</span><span className="tabular-nums">{dkk(-(sum("income", data?.closing ?? {}) + sum("expense", data?.closing ?? {})))}</span></div>
          </CardContent></Card>
      </div>
      <ReconCard closing={data?.closing ?? {}} />
    </div>
  );
}

function ReconCard({ closing }: { closing: Record<string, number> }) {
  const run = useServerFn(runStripeAction);
  const [recon, setRecon] = useState<any[] | null>(null);
  const bankFn = useServerFn(listBankAccounts);
  const { data: banks } = useQuery({ queryKey: ["fin", "banks"], queryFn: () => bankFn() });
  const last = ((banks?.statements ?? []) as any[])[0];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Afstemning</CardTitle><CardDescription>Bogført saldo sammenlignes med Stripe (tilgængelig + afventende + reserveret) og seneste kontoudtog. Forskelle skal forklares.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            const r: any = await run({ data: { env: "live", action: "balance" } });
            if (r.error) { toast.error(r.error); return; }
            setRecon(reconcileStripe(r.result, { dkk: closing["1010"] ?? 0 }));
          }}>Afstem Stripe (live)</Button>
        </div>
        {recon?.map((r) => <div key={r.currency}>{r.currency.toUpperCase()}: bogført {dkk(r.book)} · Stripe {dkk(r.stripeTotal)} (tilgængelig {dkk(r.available)}, afventer {dkk(r.pending)}, reserveret {dkk(r.reserved)}) <StatusBadge ok={r.difference === 0}>Difference {dkk(r.difference)}</StatusBadge></div>)}
        <div>Bank: {last ? <>kontoudtog {last.statement_date}: {dkk(last.balance_minor)} · bogført (perioden) {dkk(closing["1000"] ?? 0)} <StatusBadge ok={(closing["1000"] ?? 0) === Number(last.balance_minor)}>Difference {dkk((closing["1000"] ?? 0) - Number(last.balance_minor))}</StatusBadge><span className="block text-xs text-muted-foreground">Vælg “Til”-datoen lig kontoudtogets dato for en præcis sammenligning.</span></> : "Intet kontoudtog importeret."}</div>
      </CardContent>
    </Card>
  );
}

const emptyRule = { name: "", priority: "100", match_type: "metadata", match_key: "kind", match_value: "", category: "donation", environment: "", active: true, note: "" };
export function RulesTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const fn = useServerFn(listRules);
  const { data: rules = [] } = useQuery({ queryKey: ["fin", "rules"], queryFn: () => fn() });
  const save = useAction(useServerFn(saveRule), ["fin"], "Regel gemt – reglerne skal godkendes igen");
  const del = useAction(useServerFn(deleteRule), ["fin"], "Regel slettet");
  const [r, setR] = useState<any>(emptyRule);
  const ACC: Record<string, string> = { membership: "4000", donation: "4100", sponsorship: "4200", coaching: "4300", other_income: "4900" };
  return (
    <div className="space-y-4">
      <Alert><AlertTitle>Ingen gætteri</AlertTitle><AlertDescription>Indtægter kategoriseres kun ud fra dokumenteret produkt, pris, opslagsnøgle eller metadata. Beløb bruges aldrig. Hvis ingen eller flere modstridende regler passer, sendes posten til kontrol. Ændring af regler slår automatisk bogføring fra, til reglerne er godkendt igen.</AlertDescription></Alert>
      <Card><CardContent className="space-y-2 pt-6 text-sm">
        {(rules as any[]).map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <Badge variant={x.active ? "secondary" : "outline"}>{x.active ? "Aktiv" : "Inaktiv"}</Badge>
            <span className="font-medium">{x.name}</span>
            <span className="text-muted-foreground">{x.match_type}{x.match_key ? `.${x.match_key}` : ""} = “{x.match_value}” → {CATEGORY_LABEL[x.category as keyof typeof CATEGORY_LABEL]} ({x.account_code}) · prioritet {x.priority}{x.environment ? ` · ${x.environment}` : ""}</span>
            {isFinAdmin && <><Button size="sm" variant="ghost" onClick={() => setR({ ...x, priority: String(x.priority), environment: x.environment ?? "", match_key: x.match_key ?? "", note: x.note ?? "" })}>Redigér</Button><Button size="sm" variant="ghost" onClick={() => del.mutate({ data: { id: x.id } } as any)}>Slet</Button></>}
          </div>
        ))}
      </CardContent></Card>
      {isFinAdmin && (
        <Card><CardHeader><CardTitle className="text-base">{r.id ? "Redigér regel" : "Ny regel"}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <div><Label>Navn</Label><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
            <div><Label>Type</Label><select className="h-9 w-full rounded border border-input bg-background px-2" value={r.match_type} onChange={(e) => setR({ ...r, match_type: e.target.value })}><option value="metadata">Metadata</option><option value="product_id">Produkt-ID</option><option value="price_id">Pris-ID</option><option value="lookup_key">Opslagsnøgle</option></select></div>
            {r.match_type === "metadata" && <div><Label>Metadata-nøgle</Label><Input value={r.match_key} onChange={(e) => setR({ ...r, match_key: e.target.value })} /></div>}
            <div><Label>Værdi</Label><Input value={r.match_value} onChange={(e) => setR({ ...r, match_value: e.target.value })} /></div>
            <div><Label>Kategori</Label><select className="h-9 w-full rounded border border-input bg-background px-2" value={r.category} onChange={(e) => setR({ ...r, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><Label>Prioritet</Label><Input value={r.priority} onChange={(e) => setR({ ...r, priority: e.target.value })} /></div>
            <div><Label>Miljø</Label><select className="h-9 w-full rounded border border-input bg-background px-2" value={r.environment} onChange={(e) => setR({ ...r, environment: e.target.value })}><option value="">Begge</option><option value="live">Live</option><option value="sandbox">Test</option></select></div>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} />Aktiv</label>
            <div className="flex items-end gap-2">
              <Button disabled={!r.name || !r.match_value} onClick={() => save.mutate({ data: { id: r.id, name: r.name, priority: Number(r.priority) || 100, match_type: r.match_type, match_key: r.match_type === "metadata" ? r.match_key : null, match_value: r.match_value, category: r.category, account_code: ACC[r.category], environment: r.environment || null, active: r.active, note: r.note || null } } as any, { onSuccess: () => setR(emptyRule) })}>Gem</Button>
              {r.id && <Button variant="outline" onClick={() => setR(emptyRule)}>Annullér</Button>}
            </div>
          </CardContent></Card>
      )}
    </div>
  );
}

export function PeriodsTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const fn = useServerFn(listPeriods);
  const { data: periods = [] } = useQuery({ queryKey: ["fin", "periods"], queryFn: () => fn() });
  const add = useAction(useServerFn(upsertPeriod), ["fin"], "Periode oprettet");
  const lock = useAction(useServerFn(setPeriodLock), ["fin"], "Opdateret");
  const [start, setStart] = useState("");
  const [kind, setKind] = useState<"month" | "year">("month");
  return (
    <div className="space-y-4">
      {isFinAdmin && <div className="flex items-end gap-2">
        <select className="h-9 rounded border border-input bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="month">Måned</option><option value="year">År</option></select>
        <div><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <Button disabled={!start} onClick={() => add.mutate({ data: { kind, period_start: start } } as any)}>Opret periode</Button>
      </div>}
      {(periods as any[]).map((p) => <PeriodRow key={p.id} p={p} isFinAdmin={isFinAdmin} lock={lock} />)}
      {(periods as any[]).length === 0 && <p className="text-muted-foreground">Ingen perioder oprettet.</p>}
    </div>
  );
}

function PeriodRow({ p, isFinAdmin, lock }: { p: any; isFinAdmin: boolean; lock: any }) {
  const [reason, setReason] = useState("");
  const [meeting, setMeeting] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const approve = useAction(useServerFn(recordApproval), ["fin"], "Godkendelse registreret");
  const apFn = useServerFn(listApprovals);
  const { data: aps = [] } = useQuery({ queryKey: ["fin", "papprovals", p.id], queryFn: () => apFn({ data: { subject_id: p.id } } as any) });
  const STAGE: Record<string, string> = { draft: "Udkast", board_approved: "Godkendt af bestyrelsen", general_assembly_approved: "Godkendt af generalforsamlingen" };
  return (
    <Card><CardContent className="space-y-2 pt-6 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.kind === "year" ? "År" : "Måned"} {p.period_start} – {p.period_end}</span>
        <Badge variant={p.status === "locked" ? "secondary" : "outline"}>{p.status === "locked" ? "Låst" : "Åben"}</Badge>
        {p.kind === "year" && <Badge variant="outline">{STAGE[p.approval_stage] ?? p.approval_stage}</Badge>}
        {p.reopen_reason && <span className="text-xs text-muted-foreground">Genåbnet: {p.reopen_reason}</span>}
      </div>
      {isFinAdmin && (p.status === "locked"
        ? <div className="flex gap-2"><Input placeholder="Begrundelse for genåbning" value={reason} onChange={(e) => setReason(e.target.value)} /><Button variant="outline" onClick={() => lock.mutate({ data: { id: p.id, lock: false, reason } } as any)}>Genåbn</Button></div>
        : <Button size="sm" onClick={() => lock.mutate({ data: { id: p.id, lock: true } } as any)}>Lås periode</Button>)}
      {p.kind === "year" && (
        <div className="space-y-2 border-t border-border pt-2">
          {(aps as any[]).map((a) => <div key={a.id} className="text-xs">{a.subject_type === "period_board" ? "Bestyrelse" : "Generalforsamling"}: {a.approver_name} {a.decision === "approved" ? "godkendte" : "afviste"} {a.meeting_date ?? a.created_at.slice(0, 10)}</div>)}
          <Button size="sm" variant="secondary" onClick={() => approve.mutate({ data: { subject_type: "period_board", subject_id: p.id, decision: "approved" } } as any)}>Registrér min godkendelse (bestyrelse)</Button>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Generalforsamlingens dato</Label><Input type="date" value={meeting} onChange={(e) => setMeeting(e.target.value)} /></div>
            <DocPicker value={docs} onChange={setDocs} kind="minutes" />
            <Button size="sm" disabled={!meeting || docs.length === 0} onClick={() => approve.mutate({ data: { subject_type: "period_general_assembly", subject_id: p.id, decision: "approved", meeting_date: meeting, document_id: docs[0] } } as any)}>Registrér generalforsamlingens godkendelse</Button>
          </div>
          <p className="text-xs text-muted-foreground">Systemet registrerer kun godkendelser, som faktisk er givet. Det opretter dem aldrig selv.</p>
        </div>
      )}
    </CardContent></Card>
  );
}

export function BackupTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const { data } = useOverview();
  const backup = useServerFn(createFullBackup);
  const restore = useServerFn(runRestoreTest);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<any[] | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const runs = (data?.backups ?? []) as any[];
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Ekstern backup er ikke sat op</AlertTitle>
        <AlertDescription>
          Automatisk backup til et eksternt lager kræver en forbindelse til fx Google Drive eller Dropbox, som endnu ikke er tilsluttet. Indtil da: hent den samlede eksport herunder mindst én gang om måneden, og gem den på et andet sted (fx foreningens delte drev). Eksporten gemmes også privat i systemet, men det er ikke en ekstern backup.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Samlet eksport</CardTitle><CardDescription>Alle regnskabsdata, alle bilagsfiler og en oversigt med kontrolsummer, antal rækker og saldi i én ZIP-fil. Indeholder ingen adgangsnøgler.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Button disabled={!isFinAdmin || busy} onClick={async () => {
            setBusy(true);
            try { const r = await backup({ data: { includeStripeRaw: true } }); setLastRun(r.runId); window.open(r.url, "_blank", "noopener"); toast.success(`Eksport klar (${Math.round(r.size / 1024)} kB)`); }
            catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? "Laver eksport…" : "Hent samlet eksport (ZIP)"}</Button>
          <Button variant="outline" disabled={!isFinAdmin || busy || !(lastRun ?? runs.find((r) => r.kind === "download" && r.status === "succeeded")?.id)} onClick={async () => {
            setBusy(true);
            try { const r = await restore({ data: { runId: (lastRun ?? runs.find((x) => x.kind === "download" && x.status === "succeeded").id) as string } }); setChecks(r.checks); }
            catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }} className="ml-2">Gendannelsestest af seneste eksport</Button>
          <p className="text-xs text-muted-foreground">Gendannelsestesten åbner eksporten adskilt fra de rigtige data (i hukommelsen) og kontrollerer filer, kontrolsummer, rækker, balance og saldi. Den skriver ikke til en separat database.</p>
          {checks && checks.map((c) => <div key={c.name} className="flex gap-2"><StatusBadge ok={c.ok}>{c.ok ? "OK" : "Fejl"}</StatusBadge>{c.name}{c.detail ? ` – ${c.detail}` : ""}</div>)}
          <div className="border-t border-border pt-2">
            <div className="font-medium">Seneste kørsler</div>
            {runs.map((r) => <div key={r.id} className="text-xs">{new Date(r.started_at).toLocaleString("da-DK")} · {r.kind === "download" ? "Eksport" : r.kind === "restore_test" ? "Gendannelsestest" : r.kind} · {r.status}{r.error ? ` · ${r.error}` : ""}</div>)}
            {runs.length === 0 && <div className="text-xs text-muted-foreground">Ingen endnu.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function LogTab() {
  const fn = useServerFn(listFinanceAudit);
  const { data: rows = [] } = useQuery({ queryKey: ["fin", "audit"], queryFn: () => fn() });
  return (
    <Card><CardContent className="space-y-1 pt-6 text-xs">
      {(rows as any[]).map((r) => <div key={r.id}><span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("da-DK")}</span> · {r.actor} · {r.action} · {r.subject_type}</div>)}
      {(rows as any[]).length === 0 && <p className="text-muted-foreground">Ingen hændelser.</p>}
    </CardContent></Card>
  );
}

export function GuideTab() {
  const steps = [
    "Opsætning → Økonomirettigheder: giv kassereren rollen Kasserer og øvrige bestyrelsesmedlemmer rollen Godkender.",
    "Bank: opret foreningens bankkonto og importér det første kontoudtog som CSV.",
    "Opsætning → Skæringspunkt: angiv tidspunktet for overtagelsen og godkend det.",
    "Stripe: tryk “Tjek adgang”, derefter “Start historikimport” (tryk igen, indtil den er fuldført). Historik før skæringspunktet bliver kun dokumentation.",
    "Åbning: vælg konti for kladde A og B, upload dokumentation, afstem beløb, få godkendelser og bogfør.",
    "Regler: gennemgå og aktivér reglerne for donation/coaching (og evt. kontingent), og godkend dem under Opsætning.",
    "Moms/skat: notér den konkrete afklaring, før den markeres som afklaret.",
    "Først derefter: slå automatisk bogføring til under Opsætning.",
    "Backup: hent samlet eksport månedligt og kør gendannelsestest, indtil ekstern backup er tilsluttet.",
  ];
  const notDone = [
    "Automatisk ekstern backup (kræver tilsluttet Google Drive/Dropbox) – ikke implementeret.",
    "Gendannelsestest i en separat database – testen kører i hukommelsen.",
    "Stripe-import, webhooks, refunds, disputes og udbetalinger er ikke afprøvet mod rigtige Stripe-data.",
    "AI-aflæsning af bilag er ikke afprøvet med rigtige bilag.",
    "Bankimport er afprøvet med testfiler, ikke med en rigtig fil fra foreningens bank.",
    "Stripe-konti med flere tilknyttede konti (Connect) understøttes ikke – der regnes med én konto.",
    "Indgående betalinger fra medlemmer via kontingent-flow findes ikke i appen; der laves ingen abonnementer.",
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Opsætning trin for trin</CardTitle></CardHeader><CardContent><ol className="list-decimal space-y-1 pl-5 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ol></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Ikke implementeret eller ikke afprøvet</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{notDone.map((s) => <li key={s}>{s}</li>)}</ul></CardContent></Card>
    </div>
  );
}
