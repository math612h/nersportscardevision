import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listApprovals, listJournal, postEntry, recordApproval, saveOpeningProposal } from "@/lib/finance/finance.functions";
import { searchUsersForAdmin } from "@/lib/league-admin-entries.functions";
import { dkk, parseDkkToMinor, useAction } from "./shared";
import { LineEditor, fromMinorLines, toMinorLines, type EditLine } from "./LineEditor";
import { DocPicker } from "./DocPicker";

export function OpeningTab({ isFinAdmin, userId }: { isFinAdmin: boolean; userId: string }) {
  const fn = useServerFn(listJournal);
  const { data: rows = [] } = useQuery({ queryKey: ["fin", "openings"], queryFn: () => fn({ data: { kind: "opening", status: "all", limit: 10 } } as any) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Åbningsposterne er forhåndsvisninger. Modposterne er kun forslag, som kassereren vælger ud fra de faktisk overtagne aktiver, forpligtelser og udgifter. En post kan først bogføres, når den er godkendt efter seneste ændring.
      </p>
      {(rows as any[]).map((e) => <OpeningCard key={e.id} entry={e} isFinAdmin={isFinAdmin} userId={userId} />)}
    </div>
  );
}

function OpeningCard({ entry, isFinAdmin, userId }: { entry: any; isFinAdmin: boolean; userId: string }) {
  const p = entry.proposal ?? {};
  const isDebt = p.type === "opening_reimbursement";
  const initialLines: EditLine[] = entry.fin_journal_lines.length
    ? fromMinorLines([...entry.fin_journal_lines].sort((a: any, b: any) => a.line_no - b.line_no))
    : isDebt
      ? [{ account: "", debit: (p.amount_minor / 100).toFixed(2).replace(".", ","), credit: "", memo: "Modpost – vælg ud fra opgørelsen" }, { account: "2100", debit: "", credit: (p.amount_minor / 100).toFixed(2).replace(".", ","), memo: `Restgæld til ${p.claimant_name}` }]
      : [{ account: "", debit: (p.amount_minor / 100).toFixed(2).replace(".", ","), credit: "", memo: "Hvor står pengene?" }, { account: "", debit: "", credit: (p.amount_minor / 100).toFixed(2).replace(".", ","), memo: "Modpost – vælg" }];
  const [amount, setAmount] = useState((p.amount_minor / 100).toFixed(2).replace(".", ","));
  const [lines, setLines] = useState<EditLine[]>(initialLines);
  const [loc, setLoc] = useState(p.location_note ?? "");
  const [docNote, setDocNote] = useState(p.documentation_note ?? "");
  const [docs, setDocs] = useState<string[]>(entry.document_ids ?? []);
  const [required, setRequired] = useState(String(p.required_approvals ?? 1));
  const [claimant, setClaimant] = useState<{ id: string; name: string } | null>(p.claimant_user_id ? { id: p.claimant_user_id, name: p.claimant_name } : null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const search = useServerFn(searchUsersForAdmin);
  const save = useAction(useServerFn(saveOpeningProposal), ["fin"], "Forslag gemt – tidligere godkendelser gælder ikke længere");
  const approve = useAction(useServerFn(recordApproval), ["fin"], "Registreret");
  const post = useAction(useServerFn(postEntry), ["fin"], "Bogført");
  const apFn = useServerFn(listApprovals);
  const { data: approvals = [] } = useQuery({ queryKey: ["fin", "approvals", entry.id], queryFn: () => apFn({ data: { subject_type: "opening_entry", subject_id: entry.id } } as any) });
  const fresh = (approvals as any[]).filter((a) => a.created_at >= entry.updated_at);
  const stale = (approvals as any[]).filter((a) => a.created_at < entry.updated_at);
  const posted = entry.status === "posted";
  let minor: any[] = []; let err = "";
  try { minor = toMinorLines(lines); } catch (e) { err = (e as Error).message; }
  const isClaimant = isDebt && claimant?.id === userId;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {isDebt ? "Kladde B – udlægsopgørelse" : "Kladde A – overtaget beholdning"}
          <Badge variant={posted ? "secondary" : "outline"}>{posted ? `Bogført #${entry.entry_no}` : "Forhåndsvisning"}</Badge>
          {p.preliminary && <Badge variant="destructive">Foreløbigt beløb</Badge>}
        </CardTitle>
        <CardDescription>
          {entry.description}. {isDebt ? p.note : "Beløbet er vedtaget pr. 10/11-2026. Angiv hvor pengene faktisk står, og hvilken dokumentation der ligger bag."}
          {isDebt && " Opgørelsen og kvitteringerne er dokumentation for restgælden og bogføres ikke som nye driftsudgifter."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label>Beløb (afstemt)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={posted || !isFinAdmin} /></div>
          <div><Label>Antal godkendelser krævet</Label><Input value={required} onChange={(e) => setRequired(e.target.value)} disabled={posted || !isFinAdmin} /></div>
          {isDebt && (
            <div>
              <Label>Udlægshaver (bruger)</Label>
              {claimant ? <div className="text-sm">{claimant.name} {!posted && isFinAdmin && <button className="underline" onClick={() => setClaimant(null)}>skift</button>}</div> : (
                <div className="flex gap-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg" /><Button size="sm" variant="outline" onClick={async () => setHits(await search({ data: { q } }))}>Søg</Button></div>
              )}
              {!claimant && hits.map((h) => <button key={h.id} className="block text-sm underline" onClick={() => { setClaimant({ id: h.id, name: h.display_name }); setHits([]); }}>{h.display_name ?? h.lmu_name}</button>)}
            </div>
          )}
        </div>
        <LineEditor lines={lines} onChange={setLines} />
        {!isDebt && <div><Label>Hvor står pengene?</Label><Textarea rows={2} value={loc} onChange={(e) => setLoc(e.target.value)} disabled={posted || !isFinAdmin} placeholder="Fx Stripe-saldo pr. 10/11 jf. Stripe-udtræk, eller bankkonto …" /></div>}
        <div><Label>Dokumentation</Label><Textarea rows={2} value={docNote} onChange={(e) => setDocNote(e.target.value)} disabled={posted || !isFinAdmin} placeholder="Hvilke bilag/udtræk ligger bag beløbet" /></div>
        <DocPicker value={docs} onChange={setDocs} kind={isDebt ? "reimbursement_statement" : "statement"} />
        {!posted && isFinAdmin && (
          <Button disabled={!!err} onClick={() => save.mutate({ data: {
            id: entry.id, amount_minor: parseDkkToMinor(amount), lines: minor, location_note: loc, documentation_note: docNote, document_ids: docs,
            required_approvals: Number(required) || 1, claimant_user_id: claimant?.id ?? null,
          } } as any)}>Gem forslag</Button>
        )}
        <div className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="font-medium">Godkendelser ({fresh.filter((a) => a.decision === "approved").length}/{p.required_approvals ?? 1})</div>
          {fresh.map((a) => <div key={a.id}>{a.approver_name}: {a.decision === "approved" ? "godkendt" : "afvist"} {new Date(a.created_at).toLocaleString("da-DK")}{a.note ? ` – ${a.note}` : ""}</div>)}
          {stale.length > 0 && <div className="text-xs text-muted-foreground">{stale.length} ældre godkendelse(r) gælder ikke, fordi forslaget er ændret siden.</div>}
          {!posted && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" disabled={isClaimant || entry.fin_journal_lines.length === 0} onClick={() => approve.mutate({ data: { subject_type: "opening_entry", subject_id: entry.id, decision: "approved" } } as any)}>Godkend</Button>
              <Button size="sm" variant="outline" disabled={isClaimant} onClick={() => approve.mutate({ data: { subject_type: "opening_entry", subject_id: entry.id, decision: "rejected" } } as any)}>Afvis</Button>
              {isClaimant && <span className="text-xs text-muted-foreground">Du er udlægshaver og kan ikke godkende denne post.</span>}
              {isFinAdmin && <Button size="sm" onClick={() => post.mutate({ data: { id: entry.id } } as any)}>Bogfør</Button>}
            </div>
          )}
          {entry.fin_journal_lines.length > 0 && <div className="text-xs text-muted-foreground">Gemt forslag: {entry.fin_journal_lines.map((l: any) => `${l.account_code} ${Number(l.debit_minor) ? "D " + dkk(l.debit_minor) : "K " + dkk(l.credit_minor)}`).join(" · ")}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
