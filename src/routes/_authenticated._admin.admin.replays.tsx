import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Film, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_admin/admin/replays")({
  head: () => ({
    meta: [
      { title: "Replay-filer — LMU Danmark" },
      { name: "description", content: "Upload og hent replay-filer fra PRO- og AM-serveren, så stewards kan gense incidents." },
      { property: "og:title", content: "Replay-filer — LMU Danmark" },
      { property: "og:description", content: "Upload og hent replay-filer fra PRO- og AM-serveren, så stewards kan gense incidents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReplaysPage,
});

type Replay = {
  id: string;
  division_id: string;
  server: "pro" | "am";
  path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
};

const SERVERS: { key: "pro" | "am"; label: string }[] = [
  { key: "pro", label: "PRO-server" },
  { key: "am", label: "AM-server" },
];

function fmtSize(bytes: number | null) {
  if (!bytes) return "–";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function ReplaysPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);

  const { data: leagues } = useQuery({
    queryKey: ["replays-leagues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["replays-divisions", leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,name,race_date")
        .eq("league_id", leagueId!)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: replays } = useQuery({
    queryKey: ["division-replays", divisionId],
    enabled: !!divisionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_replays")
        .select("id,division_id,server,path,file_name,size_bytes,created_at")
        .eq("division_id", divisionId!);
      if (error) throw error;
      return (data ?? []) as Replay[];
    },
  });

  useEffect(() => {
    if (!leagueId && leagues && leagues.length > 0) setLeagueId(leagues[0].id);
  }, [leagues, leagueId]);
  useEffect(() => {
    if (divisions && divisions.length > 0 && !divisions.some((d: any) => d.id === divisionId)) {
      setDivisionId(divisions[0].id);
    }
  }, [divisions, divisionId]);

  const byServer = useMemo(() => {
    const m: Record<string, Replay | undefined> = {};
    for (const r of replays ?? []) m[r.server] = r;
    return m;
  }, [replays]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["division-replays", divisionId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Film className="h-4 w-4" />
        <h1 className="text-xs font-semibold uppercase tracking-[0.18em]">Replay-filer</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload én replay-fil pr. server (PRO og AM) for hver afdeling. Stewards kan hente filerne og gense incidents.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Vælg afdeling</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={leagueId ?? undefined} onValueChange={(v) => { setLeagueId(v); setDivisionId(null); }}>
            <SelectTrigger className="h-9 w-64 text-xs">
              <SelectValue placeholder="Vælg liga" />
            </SelectTrigger>
            <SelectContent>
              {(leagues ?? []).map((l: any) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={divisionId ?? undefined} onValueChange={setDivisionId}>
            <SelectTrigger className="h-9 w-72 text-xs">
              <SelectValue placeholder="Vælg afdeling" />
            </SelectTrigger>
            <SelectContent>
              {(divisions ?? []).map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {divisionId && (
        <div className="grid gap-4 md:grid-cols-2">
          {SERVERS.map((s) => (
            <ReplaySlot
              key={s.key}
              divisionId={divisionId}
              server={s.key}
              label={s.label}
              replay={byServer[s.key] ?? null}
              canEdit={isAdmin}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplaySlot({
  divisionId,
  server,
  label,
  replay,
  canEdit,
  onChanged,
}: {
  divisionId: string;
  server: "pro" | "am";
  label: string;
  replay: Replay | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${divisionId}/${server}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("replays").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("division_replays").upsert(
        {
          division_id: divisionId,
          server,
          path,
          file_name: file.name,
          size_bytes: file.size,
          uploaded_by: user?.id ?? null,
        },
        { onConflict: "division_id,server" },
      );
      if (dbErr) {
        await supabase.storage.from("replays").remove([path]);
        throw dbErr;
      }
      if (replay?.path) await supabase.storage.from("replays").remove([replay.path]);
      toast.success(`${label}: ${file.name} uploadet`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload fejlede");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!replay) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("replays")
        .createSignedUrl(replay.path, 60 * 60, { download: replay.file_name });
      if (error) throw error;
      window.location.href = data.signedUrl;
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke hente filen");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!replay) return;
    if (!confirm(`Slet replay-filen for ${label}?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("division_replays").delete().eq("id", replay.id);
      if (error) throw error;
      await supabase.storage.from("replays").remove([replay.path]);
      toast.success("Replay slettet");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke slette");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span>{label}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{server}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {replay ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{replay.file_name}</p>
            <p>{fmtSize(replay.size_bytes)} · uploadet {new Date(replay.created_at).toLocaleString("da-DK")}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ingen replay-fil uploadet endnu.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!replay || busy} onClick={download}>
            <Download className="mr-2 h-4 w-4" /> Hent
          </Button>
          {canEdit && (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> {busy ? "Arbejder…" : replay ? "Erstat fil" : "Upload fil"}
              </Button>
              {replay && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
