import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createBankAccount, existingBankKeys, importBankRows, listBankAccounts, listBankTransactions, matchBankTransaction, matchCandidates } from "@/lib/finance/bank.functions";
import { listClaims, recordRepayment } from "@/lib/finance/finance.functions";
import { assignDedupeKeys, parseBankCsv, splitCsvLine, detectSeparator, type KeyedBankRow } from "@/lib/finance/bank-import";
import { dkk, parseDkkToMinor, useAction } from "./shared";
import { useAccounts } from "./LineEditor";
import { DocPicker } from "./DocPicker";

export function BankTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const accFn = useServerFn(listBankAccounts);
  const { data: banks } = useQuery({ queryKey: ["fin", "banks"], queryFn: () => accFn() });
  const txFn = useServerFn(listBankTransactions);
  const [status, setStatus] = useState<"unmatched" | "all">("unmatched");
  const { data: txs = [] } = useQuery({ queryKey: ["fin", "banktx", status], queryFn: () => txFn({ data: { status } } as any) });
  const create = useAction(useServerFn(createBankAccount), ["fin"], "Bankkonto oprettet");
  const [name, setName] = useState("");
  const [match, setMatch] = useState<any>(null);
  const accounts = (banks?.accounts ?? []) as any[];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Bankkonti</CardTitle><CardDescription>Der er ingen direkte bankforbindelse. Kontoudtog importeres som CSV fra netbanken.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {accounts.map((a) => <div key={a.id}>{a.name} {a.account_number ? `(${a.account_number})` : ""} · konto {a.account_code}</div>)}
          {accounts.length === 0 && <p className="text-destructive">Ingen bankkonto oprettet endnu.</p>}
          {isFinAdmin && <div className="flex gap-2"><Input placeholder="Navn, fx Foreningskonto" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={name.length < 2} onClick={() => create.mutate({ data: { name } } as any)}>Opret</Button></div>}
          <div className="pt-2 text-xs text-muted-foreground">Kontoudtog: {((banks?.statements ?? []) as any[]).map((s) => `${s.statement_date}: ${dkk(s.balance_minor)}`).join(" · ") || "ingen"}</div>
        </CardContent>
      </Card>
      {isFinAdmin && accounts.length > 0 && <CsvImport accounts={accounts} />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">Bankbevægelser
            <Button size="sm" variant={status === "unmatched" ? "default" : "outline"} onClick={() => setStatus("unmatched")}>Uafstemte</Button>
            <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>Alle</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Dato</th><th>Tekst</th><th className="text-right">Beløb</th><th>Status</th><th /></tr></thead>
            <tbody>{(txs as any[]).map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td>{t.booked_on}</td><td>{t.text}{t.suspected_duplicate_of && <Badge variant="destructive" className="ml-1">Mulig dublet</Badge>}{t.note && <span className="ml-1 text-muted-foreground">({t.note})</span>}</td>
                <td className="text-right tabular-nums">{dkk(t.amount_minor)}</td>
                <td>{t.status === "matched" ? "Afstemt" : t.status === "ignored" ? "Ignoreret" : "Uafstemt"}</td>
                <td>{isFinAdmin && t.status !== "matched" && <Button size="sm" variant="outline" onClick={() => setMatch(t)}>{t.status === "ignored" ? "Genåbn" : "Afstem"}</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {(txs as any[]).length === 0 && <p className="text-sm text-muted-foreground">Ingen bevægelser.</p>}
        </CardContent>
      </Card>
      {match && <MatchDialog tx={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function CsvImport({ accounts }: { accounts: any[] }) {
  const [bank, setBank] = useState(accounts[0].id);
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [map, setMap] = useState<{ date: number; text: number; amount: number; balance?: number; id?: number }>({ date: 0, text: 1, amount: 2 });
  const [rows, setRows] = useState<(KeyedBankRow & { include_anyway: boolean })[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [stDate, setStDate] = useState("");
  const [stBal, setStBal] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const keysFn = useServerFn(existingBankKeys);
  const imp = useAction(useServerFn(importBankRows), ["fin"]);
  const preview = async () => {
    if (!csv) return;
    const { rows: r, errors: e } = parseBankCsv(csv, map);
    setErrors(e);
    const prelim = assignDedupeKeys(r, new Set());
    const existing = new Set(await keysFn({ data: { bank_account_id: bank, keys: prelim.map((x) => x.dedupe_key) } }));
    setRows(assignDedupeKeys(r, existing).map((x) => ({ ...x, include_anyway: false })));
    const last = r.filter((x) => x.balance_after_minor !== null).at(-1);
    if (last && !stDate) { setStDate(last.booked_on); setStBal(((last.balance_after_minor as number) / 100).toFixed(2).replace(".", ",")); }
  };
  const col = (k: keyof typeof map, label: string, optional = false) => (
    <div><Label>{label}</Label>
      <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
        {optional && <option value="">(ingen)</option>}
        {header.map((h, i) => <option key={i} value={i}>{h || `Kolonne ${i + 1}`}</option>)}
      </select>
    </div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Importér kontoudtog (CSV)</CardTitle><CardDescription>Forhåndsvisning før import. Bankens transaktions-ID bruges, når det findes. Identiske linjer i samme fil bevares begge. Linjer, der allerede er importeret, springes over, medmindre du markerer dem.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <select className="h-9 rounded border border-input bg-background px-2" value={bank} onChange={(e) => setBank(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <Input type="file" accept=".csv,text/csv" className="max-w-xs" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const buf = await f.arrayBuffer();
            let text = new TextDecoder("utf-8").decode(buf);
            if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
            setCsv(text); setFilename(f.name); setRows([]);
            const first = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
            setHeader(splitCsvLine(first, detectSeparator(first)));
          }} />
        </div>
        {header.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-5">
            {col("date", "Dato")}{col("text", "Tekst")}{col("amount", "Beløb")}{col("balance", "Saldo", true)}{col("id", "Bankens ID", true)}
          </div>
        )}
        {csv && <Button variant="outline" onClick={() => preview().catch((e) => toast.error(e.message))}>Vis forhåndsvisning</Button>}
        {errors.length > 0 && <div className="text-destructive">{errors.slice(0, 10).map((e) => <div key={e}>{e}</div>)}</div>}
        {rows.length > 0 && (
          <>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th>Dato</th><th>Tekst</th><th className="text-right">Beløb</th><th>Saldo</th><th>Status</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td>{r.booked_on}</td><td>{r.text}</td><td className="text-right tabular-nums">{dkk(r.amount_minor)}</td><td className="tabular-nums">{r.balance_after_minor !== null ? dkk(r.balance_after_minor) : ""}</td>
                    <td>{r.duplicate ? <label className="flex items-center gap-1 text-destructive"><input type="checkbox" checked={r.include_anyway} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include_anyway: e.target.checked } : x)))} />Findes allerede – importér alligevel</label> : "Ny"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div><Label>Kontoudtogets dato</Label><Input type="date" value={stDate} onChange={(e) => setStDate(e.target.value)} /></div>
              <div><Label>Saldo på kontoudtoget</Label><Input value={stBal} onChange={(e) => setStBal(e.target.value)} /></div>
            </div>
            <DocPicker value={docs} onChange={setDocs} kind="statement" />
            <Button onClick={() => imp.mutate({ data: {
              bank_account_id: bank, filename, rows: rows.filter((r) => !r.duplicate || r.include_anyway).map(({ duplicate, ...r }) => r),
              statement_date: stDate || null, statement_balance_minor: stBal ? parseDkkToMinor(stBal) : null, document_id: docs[0] ?? null,
            } } as any, { onSuccess: (r: any) => { toast.success(`${r.inserted} importeret, ${r.skipped} sprunget over`); setRows([]); setCsv(null); } })}>
              Importér {rows.filter((r) => !r.duplicate || r.include_anyway).length} linjer
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MatchDialog({ tx, onClose }: { tx: any; onClose: () => void }) {
  const cand = useServerFn(matchCandidates);
  const { data } = useQuery({ queryKey: ["fin", "cand", tx.id], queryFn: () => cand({ data: { id: tx.id } }) });
  const claimsFn = useServerFn(listClaims);
  const { data: claims } = useQuery({ queryKey: ["fin", "claims"], queryFn: () => claimsFn() });
  const m = useAction(useServerFn(matchBankTransaction), ["fin"], "Afstemt");
  const repay = useAction(useServerFn(recordRepayment), ["fin"], "Tilbagebetaling registreret");
  const { data: accounts = [] } = useAccounts();
  const [acct, setAcct] = useState("");
  const [desc, setDesc] = useState(tx.text);
  const [docs, setDocs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const amt = Number(tx.amount_minor);
  const claimants = new Map<string, string>();
  for (const c of (claims?.claims ?? []) as any[]) claimants.set(c.claimant_id, c.claimant_name);
  for (const o of (claims?.openings ?? []) as any[]) if (o.proposal?.claimant_user_id && o.status === "posted") claimants.set(o.proposal.claimant_user_id, o.proposal.claimant_name);
  const done = { onSuccess: onClose };
  if (tx.status === "ignored") {
    return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Genåbn bankpost</DialogTitle></DialogHeader><Button onClick={() => m.mutate({ data: { type: "unmatch_ignore", id: tx.id } } as any, done)}>Genåbn</Button></DialogContent></Dialog>);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Afstem: {tx.booked_on} · {tx.text} · {dkk(amt)}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          {amt > 0 && (
            <section>
              <div className="font-medium">Stripe-udbetaling (intern overførsel – ingen indtægt)</div>
              {(data?.payouts ?? []).map((p: any) => <div key={p.stripe_id} className="flex items-center gap-2">{p.stripe_id} · {dkk(p.amount_minor)} · {p.status} · {p.environment}<Button size="sm" onClick={() => m.mutate({ data: { type: "payout", id: tx.id, environment: p.environment, payout_id: p.stripe_id } } as any, done)}>Match</Button></div>)}
              {(data?.payouts ?? []).length === 0 && <p className="text-muted-foreground">Ingen Stripe-udbetaling med samme beløb.</p>}
            </section>
          )}
          {amt < 0 && (
            <section>
              <div className="font-medium">Betaling af faktura</div>
              {(data?.bills ?? []).map((b: any) => (
                <div key={b.id} className="flex items-center gap-2">{b.supplier} · {b.invoice_date} · rest {dkk(Number(b.amount_dkk_minor) - b.paid)}
                  <Button size="sm" disabled={-amt > Number(b.amount_dkk_minor) - b.paid} onClick={() => m.mutate({ data: { type: "bill", id: tx.id, bill_id: b.id, amount_minor: -amt } } as any, done)}>{-amt < Number(b.amount_dkk_minor) - b.paid ? "Delbetaling" : "Match"}</Button>
                </div>
              ))}
              {(data?.bills ?? []).length === 0 && <p className="text-muted-foreground">Ingen åbne fakturaer.</p>}
              <div className="mt-2 font-medium">Tilbagebetaling af udlæg (nedskriver gælden)</div>
              {[...claimants.entries()].map(([id, n]) => <div key={id} className="flex items-center gap-2">{n}<Button size="sm" variant="outline" onClick={() => repay.mutate({ data: { claimant_id: id, amount_minor: -amt, paid_on: tx.booked_on, bank_transaction_id: tx.id } } as any, done)}>Registrér som tilbagebetaling</Button></div>)}
              {claimants.size === 0 && <p className="text-muted-foreground">Ingen udlægshavere med bogført gæld.</p>}
            </section>
          )}
          <section className="space-y-2">
            <div className="font-medium">{amt > 0 ? "Direkte indbetaling (fx sponsorat)" : "Direkte udgift"}</div>
            <div className="flex gap-2">
              <select className="h-9 rounded border border-input bg-background px-2" value={acct} onChange={(e) => setAcct(e.target.value)}>
                <option value="">Vælg konto</option>
                {(accounts as any[]).filter((a) => (amt > 0 ? ["income", "liability", "asset", "equity"] : ["expense", "liability", "asset"]).includes(a.type) && a.code !== "1000").map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <DocPicker value={docs} onChange={setDocs} />
            <Button disabled={!acct} onClick={() => m.mutate({ data: { type: "direct", id: tx.id, account: acct, description: desc, document_ids: docs } } as any, done)}>Bogfør</Button>
          </section>
          <section className="flex gap-2">
            <Input placeholder="Begrundelse for at ignorere (fx dublet)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="outline" disabled={note.length < 3} onClick={() => m.mutate({ data: { type: "ignore", id: tx.id, note } } as any, done)}>Ignorér</Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
