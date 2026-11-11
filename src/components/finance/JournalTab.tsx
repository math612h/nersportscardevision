import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteDraftEntry, listJournal, postEntry, reverseEntry, saveDraftEntry } from "@/lib/finance/finance.functions";
import { dkk, ENTRY_KIND, useAction } from "./shared";
import { LineEditor, fromMinorLines, toMinorLines, type EditLine } from "./LineEditor";
import { DocPicker } from "./DocPicker";

export function JournalTab({ isFinAdmin, initialAccount }: { isFinAdmin: boolean; initialAccount?: string }) {
  const [status, setStatus] = useState<"all" | "draft" | "posted" | "review">("all");
  const [account, setAccount] = useState(initialAccount ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fn = useServerFn(listJournal);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fin", "journal", status, account, from, to],
    queryFn: () => fn({ data: { status, account: account || undefined, from: from || undefined, to: to || undefined, limit: 500 } } as any),
  });
  const [edit, setEdit] = useState<any | null>(null);
  const [reverse, setReverse] = useState<any | null>(null);
  const post = useAction(useServerFn(postEntry), ["fin"], "Bogført");
  const del = useAction(useServerFn(deleteDraftEntry), ["fin"], "Slettet");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle</SelectItem><SelectItem value="review">Kræver kontrol</SelectItem><SelectItem value="draft">Kladder</SelectItem><SelectItem value="posted">Bogført</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Konto</Label><Input className="w-24" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="fx 1010" /></div>
        <div><Label>Fra</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Til</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {isFinAdmin && <Button className="ml-auto" onClick={() => setEdit({ entry_date: new Date().toISOString().slice(0, 10), description: "", lines: [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }], document_ids: [] })}>Ny kladde</Button>}
      </div>
      {isLoading ? <p className="text-muted-foreground">Indlæser…</p> : (
        <div className="space-y-2">
          {(rows as any[]).map((e) => (
            <div key={e.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{e.entry_no ? `#${e.entry_no}` : "kladde"}</span>
                <span>{e.entry_date}</span>
                <span className="font-medium">{e.description}</span>
                <Badge variant="outline">{ENTRY_KIND[e.kind] ?? e.kind}</Badge>
                {e.status === "posted" ? <Badge variant="secondary">Bogført{e.posted_automatically ? " (automatisk)" : ""}</Badge> : <Badge variant="outline">Kladde</Badge>}
                {e.needs_review && <Badge variant="destructive">Kræver kontrol</Badge>}
                {e.environment === "sandbox" && <Badge variant="outline">Testdata</Badge>}
                {(e.document_ids?.length ?? 0) === 0 && ["bill", "normal", "bank", "reimbursement"].includes(e.kind) && <Badge variant="outline">Mangler bilag</Badge>}
                <div className="ml-auto flex gap-1">
                  {isFinAdmin && e.status === "draft" && e.kind !== "opening" && <Button size="sm" variant="outline" onClick={() => setEdit({ ...e, lines: fromMinorLines([...e.fin_journal_lines].sort((a: any, b: any) => a.line_no - b.line_no)) })}>{e.needs_review ? "Kontrollér" : "Redigér"}</Button>}
                  {isFinAdmin && e.status === "draft" && !e.needs_review && e.kind !== "opening" && <Button size="sm" onClick={() => post.mutate({ data: { id: e.id } } as any)}>Bogfør</Button>}
                  {isFinAdmin && e.status === "draft" && e.kind === "normal" && <Button size="sm" variant="ghost" onClick={() => del.mutate({ data: { id: e.id } } as any)}>Slet</Button>}
                  {isFinAdmin && e.status === "posted" && e.kind !== "reversal" && <Button size="sm" variant="ghost" onClick={() => setReverse(e)}>Tilbagefør</Button>}
                </div>
              </div>
              {(e.review_reason || e.rule_explanation) && <p className="mt-1 text-xs text-muted-foreground">{e.review_reason ? `Årsag: ${e.review_reason}` : `Regel: ${e.rule_explanation}`}{e.source_key ? ` · Kilde: ${e.source_key}` : ""}</p>}
              <table className="mt-2 w-full text-xs">
                <tbody>{[...e.fin_journal_lines].sort((a: any, b: any) => a.line_no - b.line_no).map((l: any) => (
                  <tr key={l.id}><td className="w-16 font-mono">{l.account_code}</td><td>{l.memo}</td><td className="w-28 text-right tabular-nums">{Number(l.debit_minor) ? dkk(l.debit_minor) : ""}</td><td className="w-28 text-right tabular-nums">{Number(l.credit_minor) ? dkk(l.credit_minor) : ""}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          {(rows as any[]).length === 0 && <p className="text-muted-foreground">Ingen poster.</p>}
        </div>
      )}
      {edit && <EntryDialog entry={edit} onClose={() => setEdit(null)} />}
      {reverse && <ReverseDialog entry={reverse} onClose={() => setReverse(null)} />}
    </div>
  );
}

function EntryDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  const [date, setDate] = useState(entry.entry_date);
  const [desc, setDesc] = useState(entry.description);
  const [lines, setLines] = useState<EditLine[]>(entry.lines);
  const [docs, setDocs] = useState<string[]>(entry.document_ids ?? []);
  const save = useAction(useServerFn(saveDraftEntry), ["fin"], "Kladde gemt");
  let minor: any[] = [];
  let err = "";
  try { minor = toMinorLines(lines); } catch (e) { err = (e as Error).message; }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{entry.id ? (entry.needs_review ? "Kontrollér post" : "Redigér kladde") : "Ny kladde"}</DialogTitle></DialogHeader>
        {entry.review_reason && <p className="text-sm text-destructive">Årsag til kontrol: {entry.review_reason}</p>}
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <div><Label>Dato</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Tekst</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <LineEditor lines={lines} onChange={setLines} />
        <DocPicker value={docs} onChange={setDocs} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button disabled={!!err || save.isPending} onClick={() => save.mutate({ data: { id: entry.id, entry_date: date, description: desc, lines: minor, document_ids: docs, clearReview: !!entry.needs_review } } as any, { onSuccess: onClose })}>
            {entry.needs_review ? "Gem som kontrolleret" : "Gem kladde"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReverseDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const rev = useAction(useServerFn(reverseEntry), ["fin"], "Tilbageført");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tilbagefør #{entry.entry_no}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Der oprettes en ny bogført post med modsatte beløb. Den oprindelige post bevares.</p>
        <Label>Begrundelse</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annullér</Button><Button disabled={reason.length < 3} onClick={() => rev.mutate({ data: { id: entry.id, reason } } as any, { onSuccess: onClose })}>Tilbagefør</Button></div>
      </DialogContent>
    </Dialog>
  );
}
