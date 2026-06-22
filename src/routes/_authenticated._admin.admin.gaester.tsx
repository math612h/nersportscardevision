import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createGuestCode, deleteGuestCode, listGuestCodes, updateGuestCode } from "@/lib/guest-codes.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/gaester")({
  component: GuestCodesPage,
});

function GuestCodesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; label: string } | null>(null);

  const listFn = useServerFn(listGuestCodes);
  const createFn = useServerFn(createGuestCode);
  const updateFn = useServerFn(updateGuestCode);
  const deleteFn = useServerFn(deleteGuestCode);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["admin-guest-codes"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: (label: string) => createFn({ data: { label } }),
    onSuccess: (row) => {
      toast.success("Gæstekode oprettet");
      setRevealed({ code: row.code, label: row.label });
      setNewLabel("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-guest-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRevokedMut = useMutation({
    mutationFn: ({ id, revoked }: { id: string; revoked: boolean }) => updateFn({ data: { id, revoked } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-guest-codes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => updateFn({ data: { id, label } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-guest-codes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gæstekode slettet");
      qc.invalidateQueries({ queryKey: ["admin-guest-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = codes.filter((c) =>
    [c.label, c.code].some((v) => v.toLowerCase().includes(search.toLowerCase())),
  );

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Kode kopieret");
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="h-6 w-6" /> Gæstekoder
          </h1>
          <p className="text-sm text-muted-foreground">
            Adgangskoder til sponsorer og andre gæster. Gæster kan se alt, men ikke tilmelde sig løb.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Ny gæstekode</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Opret gæstekode</DialogTitle>
              <DialogDescription>
                Giv koden en etiket (fx sponsorens navn) så I kan finde den igen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Etiket</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="fx Simrig.dk"
                maxLength={80}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuller</Button>
              <Button
                onClick={() => createMut.mutate(newLabel)}
                disabled={!newLabel.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Opretter…" : "Opret"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!revealed} onOpenChange={(v) => !v && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gæstekode oprettet</DialogTitle>
            <DialogDescription>
              Koden er også gemt i oversigten, så I altid kan slå den op senere.
            </DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{revealed.label}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wider">
                  {revealed.code}
                </code>
                <Button size="icon" variant="outline" onClick={() => copy(revealed.code)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alle gæstekoder ({codes.length})</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Søg på etiket eller kode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Indlæser…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen gæstekoder endnu.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      defaultValue={c.label}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.label) renameMut.mutate({ id: c.id, label: v });
                      }}
                      className="w-full bg-transparent text-sm font-medium outline-none focus:underline"
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-2 py-0.5 font-mono">{c.code}</code>
                      <button
                        onClick={() => copy(c.code)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" /> Kopiér
                      </button>
                      {c.revoked && <Badge variant="destructive">Spærret</Badge>}
                      {c.last_used_at && (
                        <span>Sidst brugt: {new Date(c.last_used_at).toLocaleString("da-DK")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={c.revoked ? "default" : "outline"}
                      onClick={() => toggleRevokedMut.mutate({ id: c.id, revoked: !c.revoked })}
                    >
                      {c.revoked ? "Aktivér" : "Spær"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Slet gæstekode?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Dette sletter koden og den tilhørende gæstebruger permanent.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuller</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(c.id)}>
                            Slet
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
