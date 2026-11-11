import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listClaims, recordApproval, submitClaim } from "@/lib/finance/finance.functions";
import { dkk, parseDkkToMinor, useAction } from "./shared";
import { useAccounts } from "./LineEditor";
import { DocPicker } from "./DocPicker";

const ST: Record<string, string> = { submitted: "Afventer godkendelse", approved: "Godkendt", rejected: "Afvist", paid: "Tilbagebetalt" };

export function ClaimsTab({ userId }: { userId: string }) {
  const fn = useServerFn(listClaims);
  const { data } = useQuery({ queryKey: ["fin", "claims"], queryFn: () => fn() });
  const { data: accounts = [] } = useAccounts();
  const submit = useAction(useServerFn(submitClaim), ["fin"], "Udlæg sendt til godkendelse");
  const approve = useAction(useServerFn(recordApproval), ["fin"], "Registreret");
  const [f, setF] = useState({ title: "", date: "", amount: "", account: "", docs: [] as string[] });
  const totalRepaid = ((data?.repayments ?? []) as any[]).reduce((s, r) => s + Number(r.amount_minor), 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Restgæld til udlægshavere</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="text-2xl font-semibold tabular-nums">{dkk(data?.bookedDebt ?? 0)}</div>
          <p className="text-muted-foreground">Bogført saldo på konto 2100. Kun bekræftede tilbagebetalinger efter skæringspunktet ({data?.cutoff ? new Date(data.cutoff).toLocaleDateString("da-DK") : "ikke angivet"}) nedskriver gælden. Tidligere tilbagebetalinger er allerede indregnet i den overtagne opgørelse.</p>
          <p>Tilbagebetalt siden skæringspunktet: {dkk(totalRepaid)}</p>
          {((data?.repayments ?? []) as any[]).map((r) => <div key={r.id} className="text-xs">{r.paid_on}: {dkk(r.amount_minor)}{r.note ? ` – ${r.note}` : ""}</div>)}
          <p className="text-xs text-muted-foreground">Tilbagebetalinger registreres ved at afstemme bankposteringen under Bank.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Nyt udlæg</CardTitle><CardDescription>Udlæg skal godkendes af en anden person end den, der har lagt ud. Når det er godkendt, laves en kladde til bogføring.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="sm:col-span-2"><Label>Hvad</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div><Label>Dato</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div><Label>Beløb</Label><Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Udgiftskonto</Label>
              <select className="h-9 w-full rounded border border-input bg-background px-2" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
                <option value="">Vælg</option>{(accounts as any[]).filter((a) => a.type === "expense").map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
            </div>
          </div>
          <DocPicker value={f.docs} onChange={(d) => setF({ ...f, docs: d })} />
          <Button disabled={!f.title || !f.date || !f.amount || !f.account || f.docs.length === 0} onClick={() => {
            let a: number; try { a = parseDkkToMinor(f.amount); } catch (e) { toast.error((e as Error).message); return; }
            submit.mutate({ data: { title: f.title, expense_date: f.date, amount_minor: a, expense_account_code: f.account, document_ids: f.docs } } as any, { onSuccess: () => setF({ title: "", date: "", amount: "", account: "", docs: [] }) });
          }}>Send til godkendelse</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Udlæg</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {((data?.claims ?? []) as any[]).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <span>{c.expense_date}</span><span className="font-medium">{c.title}</span><span>{c.claimant_name}</span><span className="tabular-nums">{dkk(c.amount_minor)}</span>
              <Badge variant={c.status === "rejected" ? "destructive" : "outline"}>{ST[c.status] ?? c.status}</Badge>
              {c.status === "submitted" && c.claimant_id !== userId && <>
                <Button size="sm" variant="secondary" onClick={() => approve.mutate({ data: { subject_type: "claim", subject_id: c.id, decision: "approved" } } as any)}>Godkend</Button>
                <Button size="sm" variant="outline" onClick={() => approve.mutate({ data: { subject_type: "claim", subject_id: c.id, decision: "rejected" } } as any)}>Afvis</Button>
              </>}
              {c.status === "submitted" && c.claimant_id === userId && <span className="text-xs text-muted-foreground">Skal godkendes af en anden</span>}
            </div>
          ))}
          {((data?.claims ?? []) as any[]).length === 0 && <p className="text-muted-foreground">Ingen udlæg.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
