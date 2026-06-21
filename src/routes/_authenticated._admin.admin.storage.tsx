import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderOpen, Upload, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBucketObjects, listBuckets, replaceBucketObject } from "@/lib/storage-admin.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/storage")({
  component: StoragePage,
});

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StoragePage() {
  const qc = useQueryClient();
  const fetchBuckets = useServerFn(listBuckets);
  const fetchObjects = useServerFn(listBucketObjects);
  const replace = useServerFn(replaceBucketObject);

  const { data: buckets = [] } = useQuery({ queryKey: ["storage-buckets"], queryFn: () => fetchBuckets() });
  const [bucket, setBucket] = useState<string>("track-images");
  const [prefix, setPrefix] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["storage-objects", bucket, prefix, search],
    queryFn: () => fetchObjects({ data: { bucket: bucket as any, prefix, search: search || undefined, limit: 200 } }),
    enabled: !!bucket,
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleReplaceClick = (path: string) => {
    setReplacingPath(path);
    fileInput.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !replacingPath) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB."); return; }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      await replace({ data: { bucket: bucket as any, path: replacingPath, base64, contentType: file.type || "application/octet-stream" } });
      toast.success("Fil erstattet.");
      qc.invalidateQueries({ queryKey: ["storage-objects"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      setReplacingPath(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Storage</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={bucket} onValueChange={(v) => { setBucket(v); setPrefix(""); }}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(buckets as string[]).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Søg filnavn" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {prefix && (
          <Button variant="ghost" size="sm" onClick={() => setPrefix(prefix.split("/").slice(0, -1).join("/"))}>
            ← op
          </Button>
        )}
      </div>

      {prefix && <p className="text-xs text-muted-foreground">/ {prefix}</p>}

      <input type="file" ref={fileInput} className="hidden" onChange={handleFileChange} />

      <Card>
        <CardHeader><CardTitle>{isLoading ? "Indlæser…" : `${(data?.files.length ?? 0)} filer, ${(data?.folders.length ?? 0)} mapper`}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {data?.folders.map((f) => (
            <button key={f} className="flex w-full items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-sm text-left hover:bg-muted/40"
              onClick={() => setPrefix(prefix ? `${prefix}/${f}` : f)}>
              <FolderOpen className="h-4 w-4" />
              <span className="flex-1">{f}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {data?.files.map((f) => (
            <div key={f.path} className="flex items-center gap-3 rounded border border-border/60 p-2 text-sm">
              {f.url && f.contentType?.startsWith("image/") ? (
                <img src={f.url} alt={f.name} className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">FIL</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-xs">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatSize(f.size)} · {f.contentType ?? "?"} · {f.updatedAt ? new Date(f.updatedAt).toLocaleString("da-DK") : ""}
                </p>
              </div>
              {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Åbn</a>}
              <Button size="sm" variant="outline" disabled={uploading}
                onClick={() => handleReplaceClick(f.path)}>
                <Upload className="h-3 w-3 mr-1" />Erstat
              </Button>
            </div>
          ))}
          {!isLoading && (data?.files.length ?? 0) === 0 && (data?.folders.length ?? 0) === 0 && (
            <p className="text-muted-foreground text-sm">Tom.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
