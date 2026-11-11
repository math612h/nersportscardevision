import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAccounts } from "@/lib/finance/finance.functions";
import { dkk, parseDkkToMinor } from "./shared";
import { Trash2, Plus } from "lucide-react";

export interface EditLine { account: string; debit: string; credit: string; memo?: string }

export function useAccounts() {
  const fn = useServerFn(listAccounts);
  return useQuery({ queryKey: ["fin", "accounts"], queryFn: () => fn() });
}

export function toMinorLines(lines: EditLine[]) {
  return lines.filter((l) => l.account).map((l) => ({
    account: l.account,
    debit: l.debit.trim() ? parseDkkToMinor(l.debit) : 0,
    credit: l.credit.trim() ? parseDkkToMinor(l.credit) : 0,
    memo: l.memo || undefined,
  }));
}

export function fromMinorLines(lines: any[]): EditLine[] {
  return lines.map((l) => ({
    account: l.account_code ?? l.account,
    debit: Number(l.debit_minor ?? l.debit) ? (Number(l.debit_minor ?? l.debit) / 100).toFixed(2).replace(".", ",") : "",
    credit: Number(l.credit_minor ?? l.credit) ? (Number(l.credit_minor ?? l.credit) / 100).toFixed(2).replace(".", ",") : "",
    memo: l.memo ?? "",
  }));
}

export function LineEditor({ lines, onChange }: { lines: EditLine[]; onChange: (l: EditLine[]) => void }) {
  const { data: accounts = [] } = useAccounts();
  let d = 0, c = 0, err = "";
  try { for (const l of toMinorLines(lines)) { d += l.debit; c += l.credit; } } catch (e) { err = (e as Error).message; }
  const set = (i: number, patch: Partial<EditLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_7rem_7rem_1fr_2rem] gap-2 text-xs text-muted-foreground">
        <span>Konto</span><span>Debet</span><span>Kredit</span><span>Tekst</span><span />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem_7rem_1fr_2rem] gap-2">
          <Select value={l.account} onValueChange={(v) => set(i, { account: v })}>
            <SelectTrigger><SelectValue placeholder="Vælg konto" /></SelectTrigger>
            <SelectContent>{accounts.map((a: any) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input inputMode="decimal" value={l.debit} onChange={(e) => set(i, { debit: e.target.value })} placeholder="0,00" />
          <Input inputMode="decimal" value={l.credit} onChange={(e) => set(i, { credit: e.target.value })} placeholder="0,00" />
          <Input value={l.memo ?? ""} onChange={(e) => set(i, { memo: e.target.value })} />
          <Button size="icon" variant="ghost" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Fjern linje"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm">
        <Button size="sm" variant="outline" onClick={() => onChange([...lines, { account: "", debit: "", credit: "" }])}><Plus className="mr-1 h-4 w-4" />Linje</Button>
        <span className={d === c && d > 0 && !err ? "text-muted-foreground" : "text-destructive"}>
          {err || `Debet ${dkk(d)} · Kredit ${dkk(c)}${d !== c ? ` · Difference ${dkk(d - c)}` : ""}`}
        </span>
      </div>
    </div>
  );
}
