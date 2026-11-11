import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDocumentUrl, listFinanceDocuments, uploadFinanceDocument } from "@/lib/finance/bank.functions";
import { fileToBase64 } from "./shared";

export function useDocuments() {
  const fn = useServerFn(listFinanceDocuments);
  return useQuery({ queryKey: ["fin", "docs"], queryFn: () => fn() });
}

export function useUpload() {
  const up = useServerFn(uploadFinanceDocument);
  const qc = useQueryClient();
  return async (file: File, kind: string, description?: string) => {
    if (file.size > 20 * 1024 * 1024) throw new Error("Filen er større end 20 MB");
    const doc = await up({ data: { filename: file.name, mime_type: file.type || "application/octet-stream", base64: await fileToBase64(file), kind, description } } as any);
    qc.invalidateQueries({ queryKey: ["fin", "docs"] });
    return doc as any;
  };
}

export function OpenDoc({ id, name }: { id: string; name: string }) {
  const fn = useServerFn(getDocumentUrl);
  return <button className="underline" onClick={async () => { try { const { url } = await fn({ data: { id } }); window.open(url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } }}>{name}</button>;
}

export function DocPicker({ value, onChange, kind = "receipt" }: { value: string[]; onChange: (v: string[]) => void; kind?: string }) {
  const { data: docs = [] } = useDocuments();
  const upload = useUpload();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const chosen = (docs as any[]).filter((d) => value.includes(d.id));
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Bilag:</span>
        {chosen.map((d) => <Badge key={d.id} variant="secondary" className="gap-1"><OpenDoc id={d.id} name={d.filename} /><button onClick={() => onChange(value.filter((x) => x !== d.id))} aria-label="Fjern">×</button></Badge>)}
        {chosen.length === 0 && <span className="text-destructive">Mangler bilag</span>}
        <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" multiple onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          setBusy(true);
          try { const ids: string[] = []; for (const f of files) ids.push((await upload(f, kind)).id); onChange([...value, ...ids]); }
          catch (err) { toast.error((err as Error).message); }
          finally { setBusy(false); if (ref.current) ref.current.value = ""; }
        }} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploader…" : "Upload bilag"}</Button>
        <select className="h-8 rounded border border-input bg-background px-2 text-xs" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">Vælg eksisterende…</option>
          {(docs as any[]).filter((d) => !value.includes(d.id)).slice(0, 200).map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
        </select>
      </div>
    </div>
  );
}
