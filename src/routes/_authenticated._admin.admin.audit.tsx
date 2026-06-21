import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getAuditLog } from "@/lib/audit.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/audit")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const fetchLog = useServerFn(getAuditLog);
  const [table, setTable] = useState("");
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit-log", table, search],
    queryFn: () => fetchLog({ data: { table: table || undefined, search: search || undefined, limit: 200 } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Audit log</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Filtrer på tabel (fx profiles)" value={table} onChange={(e) => setTable(e.target.value)} className="max-w-xs" />
        <Input placeholder="Søg navn eller ID" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      <Card>
        <CardHeader><CardTitle>Seneste {data.length} hændelser</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {isLoading && <p className="text-muted-foreground">Indlæser…</p>}
          {!isLoading && data.length === 0 && <p className="text-muted-foreground">Ingen hændelser.</p>}
          {(data as any[]).map((row) => (
            <details key={row.id} className="rounded border border-border/60 p-2">
              <summary className="flex flex-wrap items-center gap-2 cursor-pointer">
                <Badge variant={row.action === "delete" ? "destructive" : "secondary"}>{row.action}</Badge>
                <span className="font-mono text-xs">{row.table_name}</span>
                {row.row_id && <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{row.row_id}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("da-DK")}</span>
                <span className="text-xs text-muted-foreground">{row.actor_label ?? "system"}</span>
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {row.old_data && (
                  <pre className="overflow-auto rounded bg-muted/40 p-2 text-[10px] max-h-48">{JSON.stringify(row.old_data, null, 2)}</pre>
                )}
                {row.new_data && (
                  <pre className="overflow-auto rounded bg-muted/40 p-2 text-[10px] max-h-48">{JSON.stringify(row.new_data, null, 2)}</pre>
                )}
                {row.metadata && (
                  <pre className="overflow-auto rounded bg-muted/40 p-2 text-[10px] max-h-48 sm:col-span-2">{JSON.stringify(row.metadata, null, 2)}</pre>
                )}
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
