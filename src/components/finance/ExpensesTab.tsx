import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createBill, extractDocumentWithAI, listBills } from "@/lib/finance/bank.functions";
import { dkk, parseDkkToMinor, useAction } from "./shared";
import { useAccounts } from "./LineEditor";
import { DocPicker, OpenDoc, useDocuments, useUpload } from "./DocPicker";

const empty = { supplier: "", invoice_date: "", due_date: "", description: "", amount: "", currency: "DKK", fx_rate: "", fx_source: "", account: "", docs: [] as string[] };

export function ExpensesTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const billsFn = useServerFn(listBills);
  const { data: bills = [] } = useQuery({ queryKey: ["fin", "bills"], queryFn: () => billsFn() });
  const { data: docs = [] } = useDocuments();
  const { data: accounts = [] } = useAccounts();
  const create = useAction(useServerFn(createBill), ["fin"], "Faktura bogført som skyldig");
  const extract = useServerFn(extractDocumentWithAI);
  const upload = useUpload();
  const [f, setF] = useState(empty);
  const [ai, setAi] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const runAi = async (id: string) => {
    setBusy(true);
    try {
      const r: any = await extract({ data: { id } });
      if (r.error) { toast.error(r.error); return; }
      const x = r.extraction?.result ?? {};
      setAi(x);
      setF((p) => ({
        ...p, docs: p.docs.includes(id) ? p.docs : [...p.docs, id],
        supplier: x.supplier ?? p.supplier, invoice_date: x.invoice_date ?? p.invoice_date,
        amount: x.total != null ? String(x.total).replace(".", ",") : p.amount, currency: x.currency ?? p.currency,
      }));
    } finally { setBusy(false); }
  };
  const conf = (k: string) => ai?.confidence?.[k];
  return (
    <div className="space-y-4">
      {isFinAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ny faktura (betalt af foreningen)</CardTitle>
            <CardDescription>Fakturaen bogføres som leverandørgæld. Betalingen matches senere med bankudtoget. Udgifter betalt privat registreres under Udlæg.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { const d = await upload(file, "invoice"); await runAi(d.id); } catch (err) { toast.error((err as Error).message); }
                if (ref.current) ref.current.value = "";
              }} />
              <Button variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Læser bilag…" : "Upload og læs bilag med AI"}</Button>
              <span className="text-xs text-muted-foreground">AI udfylder kun et forslag. Felter, den ikke kan læse, forbliver tomme. Kontrollér altid.</span>
            </div>
            {ai && <div className="rounded bg-muted p-2 text-xs">AI-forslag{ai.category_suggestion ? ` · kategori: ${ai.category_suggestion}` : ""}{ai.vat_amount != null ? ` · moms på bilag: ${ai.vat_amount}` : ""}. Sikkerhed: {Object.entries(ai.confidence ?? {}).map(([k, v]) => `${k} ${Math.round(Number(v) * 100)}%`).join(", ")}</div>}
            <div className="grid gap-2 sm:grid-cols-3">
              <div><Label>Leverandør {conf("supplier") != null && <Badge variant="outline">AI {Math.round(conf("supplier") * 100)}%</Badge>}</Label><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></div>
              <div><Label>Fakturadato</Label><Input type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value })} /></div>
              <div><Label>Forfald</Label><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
              <div><Label>Beløb inkl. evt. moms</Label><Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <div><Label>Valuta</Label><Input value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></div>
              <div><Label>Udgiftskonto</Label>
                <select className="h-9 w-full rounded border border-input bg-background px-2" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
                  <option value="">Vælg</option>{(accounts as any[]).filter((a) => a.type === "expense").map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </div>
              {f.currency !== "DKK" && <>
                <div><Label>Kurs (DKK pr. 1 {f.currency})</Label><Input value={f.fx_rate} onChange={(e) => setF({ ...f, fx_rate: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Kilde for kurs</Label><Input value={f.fx_source} onChange={(e) => setF({ ...f, fx_source: e.target.value })} placeholder="Fx kontoudtog, Nationalbanken dd." /></div>
              </>}
              <div className="sm:col-span-3"><Label>Beskrivelse</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            </div>
            <DocPicker value={f.docs} onChange={(d) => setF({ ...f, docs: d })} kind="invoice" />
            <Button disabled={!f.supplier || !f.invoice_date || !f.amount || !f.account} onClick={() => {
              let amount: number; try { amount = parseDkkToMinor(f.amount); } catch (e) { toast.error((e as Error).message); return; }
              create.mutate({ data: {
                supplier: f.supplier, invoice_date: f.invoice_date, due_date: f.due_date || null, description: f.description || null,
                amount_minor: amount, currency: f.currency, fx_rate: f.fx_rate ? Number(f.fx_rate.replace(",", ".")) : null, fx_source: f.fx_source || null,
                expense_account_code: f.account, paid_by: "association", private_person_name: null, document_ids: f.docs,
              } } as any, { onSuccess: () => { setF(empty); setAi(null); } });
            }}>Bogfør faktura</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Fakturaer</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Dato</th><th>Leverandør</th><th className="text-right">Beløb</th><th className="text-right">Betalt</th><th>Bilag</th></tr></thead>
            <tbody>{(bills as any[]).map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td>{b.invoice_date}</td><td>{b.supplier}{b.description ? ` – ${b.description}` : ""}</td>
                <td className="text-right tabular-nums">{dkk(b.amount_dkk_minor)}{b.currency !== "DKK" ? ` (${b.currency})` : ""}</td>
                <td className="text-right tabular-nums">{b.paid >= Number(b.amount_dkk_minor) ? <Badge variant="secondary">Betalt</Badge> : dkk(b.paid)}</td>
                <td>{(b.document_ids?.length ?? 0) === 0 ? <Badge variant="destructive">Mangler</Badge> : b.document_ids.length}</td>
              </tr>
            ))}</tbody>
          </table>
          {(bills as any[]).length === 0 && <p className="text-sm text-muted-foreground">Ingen fakturaer.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Bilagsarkiv</CardTitle><CardDescription>Filer gemmes privat med kontrolsum. Kun personer med økonomiadgang kan åbne dem.</CardDescription></CardHeader>
        <CardContent className="space-y-1 text-xs">
          {(docs as any[]).map((d) => <div key={d.id} className="flex gap-2"><span className="text-muted-foreground">{d.created_at.slice(0, 10)}</span><OpenDoc id={d.id} name={d.filename} /><span className="text-muted-foreground">{d.kind}</span></div>)}
          {(docs as any[]).length === 0 && <p className="text-muted-foreground">Ingen bilag.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
