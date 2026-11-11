import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDkk, parseDkkToMinor } from "@/lib/finance/ledger";
import { Badge } from "@/components/ui/badge";

export const dkk = (m: number | null | undefined) => formatDkk(Number(m ?? 0));
export { parseDkkToMinor };

export function useAction<I, O>(fn: (i: I) => Promise<O>, invalidate: string[] = ["fin"], success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r: any) => {
      if (r && typeof r === "object" && "error" in r && r.error) { toast.error(String(r.error)); return; }
      if (success) toast.success(success);
      for (const k of invalidate) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function StatusBadge({ ok, children }: { ok: boolean | "warn"; children: React.ReactNode }) {
  return <Badge variant={ok === true ? "secondary" : ok === "warn" ? "outline" : "destructive"}>{children}</Badge>;
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function downloadBase64(filename: string, b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const ENTRY_KIND: Record<string, string> = {
  normal: "Manuel", opening: "Åbning", reversal: "Tilbageførsel", stripe: "Stripe", bank: "Bank", bill: "Faktura",
  bill_payment: "Fakturabetaling", reimbursement: "Udlæg", repayment: "Tilbagebetaling",
};
