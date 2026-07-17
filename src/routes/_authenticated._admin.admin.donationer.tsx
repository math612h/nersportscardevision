import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Coffee, Search, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listDonationProfiles,
  searchUsersForDonation,
  listUserDonations,
  addDonation,
  deleteDonation,
} from "@/lib/donations-admin.functions";
import { donationBorderClass, TIER_LABEL, type DonationTier } from "@/lib/donation-tier";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/admin/donationer")({
  component: AdminDonationsPage,
});

type DonorRow = {
  id: string;
  display_name: string | null;
  lmu_name: string | null;
  donation_tier: DonationTier;
  donation_total_dkk: number;
};

function TierBadge({ tier }: { tier: DonationTier }) {
  if (!tier) return null;
  return <Badge variant="outline" className={donationBorderClass(tier)}>{TIER_LABEL[tier]}</Badge>;
}

function AddDonationPanel({ onAdded }: { onAdded: () => void }) {
  const searchFn = useServerFn(searchUsersForDonation);
  const addFn = useServerFn(addDonation);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DonorRow[]>([]);
  const [picked, setPicked] = useState<DonorRow | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const doSearch = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await searchFn({ data: { q: q.trim() } });
      setResults(r.rows as DonorRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Søgning fejlede");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!picked) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Angiv et gyldigt beløb");
      return;
    }
    setBusy(true);
    try {
      await addFn({ data: { userId: picked.id, amountDkk: Math.round(n), note: note.trim() || null } });
      toast.success(`Registreret ${n} kr. til ${picked.display_name ?? "bruger"}`);
      setPicked(null);
      setAmount("");
      setNote("");
      setQ("");
      setResults([]);
      onAdded();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tilføj donation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!picked ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Søg bruger (navn eller LMU-navn)…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
              </div>
              <Button onClick={doSearch} disabled={busy || !q.trim()}>Søg</Button>
            </div>
            {results.length > 0 && (
              <div className="grid gap-1">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setPicked(r)}
                    className="flex items-center justify-between rounded border px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="text-sm">
                      {r.display_name ?? "Uden navn"}
                      {r.lmu_name && <span className="ml-2 text-xs text-muted-foreground">({r.lmu_name})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.donation_total_dkk > 0 ? `${r.donation_total_dkk} kr. i alt` : "–"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2">
              <div className="text-sm">
                <div className="font-medium">{picked.display_name ?? "Uden navn"}</div>
                <div className="text-xs text-muted-foreground">
                  Samlet indtil nu: {picked.donation_total_dkk} kr.
                  {picked.donation_tier && <> · {TIER_LABEL[picked.donation_tier]}</>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPicked(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Beløb (kr.)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-40"
              />
              <Input
                placeholder="Note (valgfri)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1"
              />
              <Button onClick={submit} disabled={busy}>Gem</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DonorCard({ row, onChange }: { row: DonorRow; onChange: () => void }) {
  const listFn = useServerFn(listUserDonations);
  const delFn = useServerFn(deleteDonation);
  const [open, setOpen] = useState(false);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["user-donations", row.id],
    queryFn: () => listFn({ data: { userId: row.id } }),
    enabled: open,
  });

  const remove = async (id: string) => {
    if (!confirm("Slet denne donation?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Slettet");
      refetch();
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Fejl");
    }
  };

  return (
    <Card className={donationBorderClass(row.donation_tier)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>
            {row.display_name ?? "Uden navn"}
            {row.lmu_name && <span className="ml-2 text-xs text-muted-foreground">({row.lmu_name})</span>}
          </span>
          <div className="flex items-center gap-2">
            <TierBadge tier={row.donation_tier} />
            <span className="text-sm font-semibold">{row.donation_total_dkk} kr.</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Skjul donationer" : "Vis donationer"}
        </Button>
        {open && (
          <div className="mt-2 space-y-1">
            {isFetching && <p className="text-xs text-muted-foreground">Henter…</p>}
            {(data?.rows ?? []).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                <div>
                  <span className="font-medium">{d.amount_dkk} kr.</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(d.donated_at).toLocaleDateString("da-DK")}
                  </span>
                  {d.note && <span className="ml-2 text-xs">— {d.note}</span>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {data && data.rows.length === 0 && (
              <p className="text-xs text-muted-foreground">Ingen donationer registreret.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminDonationsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDonationProfiles);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-donations"],
    queryFn: () => fetchList(),
  });
  const rows = (data?.rows ?? []) as DonorRow[];
  const total = rows.reduce((sum, r) => sum + (r.donation_total_dkk || 0), 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-donations"] });
    qc.invalidateQueries({ queryKey: ["donation-tier"] });
    qc.invalidateQueries({ queryKey: ["user-donations"] });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 text-primary">
        <Coffee className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Donationer</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Registrér donationer pr. bruger. Donationsfarven tildeles automatisk ud fra det samlede
        beløb: op til 250 kr. = bronze, op til 1.000 kr. = sølv, over 1.000 kr. = guld.
      </p>

      <AddDonationPanel onAdded={refresh} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Donorer</h2>
        <span className="text-sm text-muted-foreground">I alt: {total} kr.</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen donationer registreret endnu.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <DonorCard key={r.id} row={r} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
