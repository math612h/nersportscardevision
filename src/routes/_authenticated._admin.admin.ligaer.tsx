import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Pencil,
  Archive,
  ArchiveRestore,
  Send,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncDiscordRolesForLeague } from "@/lib/discord-sync.functions";

import type { ClassConfig } from "@/lib/tracks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeagueFormWizard } from "@/components/LeagueFormWizard";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer")({
  component: AdminLeagues,
});

function AdminLeagues() {
  const location = useLocation();
  const isLeagueList = location.pathname === "/admin/ligaer";
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-admin", showArchive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("published", !showArchive)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reorder = useMutation({
    mutationFn: async ({ dir, id }: { dir: "up" | "down"; id: string }) => {
      const { reorderLeaguesSwap } = await import("@/lib/league-order");
      await reorderLeaguesSwap(leagues ?? [], id, dir);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leagues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Slettet");
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase
        .from("leagues")
        .update({ published: publish } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.publish ? "Liga publiceret" : "Liga arkiveret");
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isLeagueList) return <Outlet />;

  const activeCount = leagues?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {showArchive ? "Ligaer · arkiv" : "Ligaer"}
              </h1>
              <Badge variant="secondary" className="rounded-full">
                {activeCount}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {showArchive
                ? "Arkiverede ligaer og off-season events."
                : "Administrer aktive ligaer, afdelinger og stillinger."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" /> Kontrolpanel
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setShowArchive((v) => !v)}
            >
              {showArchive ? (
                <>
                  <ArchiveRestore className="h-4 w-4" /> Aktive
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" /> Arkiv
                </>
              )}
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Ny liga
            </Button>
            <LeagueFormWizard
              open={createOpen}
              onOpenChange={setCreateOpen}
              mode="create"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {leagues?.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            {showArchive
              ? "Arkivet er tomt."
              : 'Ingen ligaer endnu — opret den første med "Ny liga".'}
          </div>
        )}
        {leagues?.map((l: any, idx: number) => {
          const cfgs: ClassConfig[] = Array.isArray(l.class_configs) ? l.class_configs : [];
          const canMoveUp = idx > 0;
          const canMoveDown = idx < (leagues.length - 1);
          const handleMove = (dir: "up" | "down") => {
            if (!leagues) return;
            reorder.mutate({ id: l.id, dir });
          };
          return (
            <Card key={l.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <div className="flex flex-col sm:flex-row">
                <LeagueBannerThumb pathOrUrl={l.banner_url} />
                <div className="flex-1 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold leading-tight">{l.name}</h3>
                        {l.is_offseason && (
                          <Badge variant="secondary" className="text-[10px]">
                            Off-season
                          </Badge>
                        )}
                        {l.teams_allowed && (
                          <Badge variant="outline" className="text-[10px]">
                            Teams
                          </Badge>
                        )}
                        {!l.published && (
                          <Badge variant="outline" className="text-[10px]">
                            Kladde
                          </Badge>
                        )}
                      </div>
                      {l.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {l.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cfgs.length > 0
                          ? cfgs.map((c, i) => (
                              <Badge key={i} variant="outline" className="font-normal">
                                {c.car_class} · {c.driver_category} · #{c.number_from}-{c.number_to}
                                {c.max_drivers ? ` · maks ${c.max_drivers}` : ""}
                              </Badge>
                            ))
                          : (
                              <>
                                {l.car_class && <Badge>{l.car_class}</Badge>}
                                {l.driver_category && (
                                  <Badge variant="secondary">{l.driver_category}</Badge>
                                )}
                              </>
                            )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!canMoveUp || reorder.isPending}
                        onClick={() => handleMove("up")}
                        title="Flyt op"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!canMoveDown || reorder.isPending}
                        onClick={() => handleMove("down")}
                        title="Flyt ned"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button asChild variant="secondary" size="sm" className="gap-1">
                        <Link
                          to="/admin/ligaer/$leagueId/afdelinger"
                          params={{ leagueId: l.id }}
                        >
                          <Settings className="h-3.5 w-3.5" /> Afdelinger
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to="/admin/ligaer/$leagueId/stillinger"
                          params={{ leagueId: l.id }}
                        >
                          Stillinger
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to="/admin/ligaer/$leagueId/regler"
                          params={{ leagueId: l.id }}
                        >
                          Regler
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to="/admin/ligaer/$leagueId/entries"
                          params={{ leagueId: l.id }}
                        >
                          Entries
                        </Link>
                      </Button>
                      {l.discord_role_id && <SyncDiscordRolesButton leagueId={l.id} />}
                    </div>
                    <div className="flex gap-0.5">
                      <EditLeagueButton league={l} />
                      {l.published ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Arkiver"
                          onClick={() => {
                            if (
                              confirm(
                                "Arkiver liga? Den vil ikke længere være synlig for offentligheden.",
                              )
                            )
                              togglePublish.mutate({ id: l.id, publish: false });
                          }}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Publicer"
                          onClick={() => togglePublish.mutate({ id: l.id, publish: true })}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Slet"
                        onClick={() => {
                          if (confirm("Slet liga?")) del.mutate(l.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LeagueBannerThumb({ pathOrUrl }: { pathOrUrl: string | null }) {
  const { data: signedUrl } = useQuery({
    queryKey: ["league-thumb", pathOrUrl],
    enabled: !!pathOrUrl && !pathOrUrl.startsWith("http"),
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("league-banners")
        .createSignedUrl(pathOrUrl!, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  const src = pathOrUrl?.startsWith("http") ? pathOrUrl : signedUrl;
  return (
    <div className="relative h-32 w-full shrink-0 overflow-hidden bg-gradient-to-br from-muted to-muted/50 sm:h-auto sm:w-48">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Intet billede
        </div>
      )}
    </div>
  );
}

function EditLeagueButton({ league }: { league: any }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Rediger"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {open && (
        <LeagueFormWizard
          key={league.id}
          open={open}
          onOpenChange={setOpen}
          mode="edit"
          league={league}
        />
      )}
    </>
  );
}

function SyncDiscordRolesButton({ leagueId }: { leagueId: string }) {
  const syncFn = useServerFn(syncDiscordRolesForLeague);
  const [pending, setPending] = useState(false);
  const onClick = async () => {
    if (!confirm("Synkronisér Discord-rollen, så kun folk på entry-listen har den?")) return;
    setPending(true);
    try {
      const res = await syncFn({ data: { leagueId } });
      if (!res.ok) {
        toast.error(res.reason === "no_role" ? "Ligaen har ingen Discord-rolle." : "Sync mislykkedes.");
        return;
      }
      const baseMsg = `Sync færdig: tilføjet ${res.added}, fjernet ${res.removed} (mål ${res.targets}, havde ${res.hadRole}).`;
      if (res.errors && res.errors.length > 0) {
        console.warn("Discord sync-fejl:", res.errors);
        toast.error(`${baseMsg}\n${res.errors.length} kald fejlede:\n${res.errors.join("\n")}`, {
          duration: 20000,
        });
      } else {
        toast.success(baseMsg);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Sync fejlede.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
      {pending ? "Synkroniserer…" : "Synk Discord-rolle"}
    </Button>
  );
}
