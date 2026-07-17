import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Heart, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listDonationProfiles, setDonationTier } from "@/lib/donations-admin.functions";
import { donationBorderClass, TIER_LABEL, type DonationTier } from "@/lib/donation-tier";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/admin/donationer")({
  component: AdminDonationsPage,
});

type Row = {
  id: string;
  display_name: string | null;
  lmu_name: string | null;
  donation_tier: DonationTier;
  donation_total_dkk: number;
  donation_note: string | null;
};

function AdminDonationsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDonationProfiles);
  const saveFn = useServerFn(setDonationTier);
  const [q, setQ] = useState("");
  const [onlyDonors, setOnlyDonors] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-donations"],
    queryFn: () => fetchList(),
  });

  const rows = (data?.rows ?? []) as Row[];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyDonors && !r.donation_tier) return false;
      if (!needle) return true;
      return (
        (r.display_name ?? "").toLowerCase().includes(needle) ||
        (r.lmu_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, onlyDonors]);

  const save = async (userId: string, patch: { tier?: DonationTier; totalDkk?: number; note?: string | null }) => {
    try {
      await saveFn({
        data: {
          userId,
          tier: patch.tier === undefined ? (rows.find((r) => r.id === userId)?.donation_tier ?? null) : patch.tier,
          totalDkk: patch.totalDkk,
          note: patch.note,
        },
      });
      toast.success("Gemt");
      qc.invalidateQueries({ queryKey: ["admin-donations"] });
      qc.invalidateQueries({ queryKey: ["donation-tier"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 text-primary">
        <Heart className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Donationsfarver</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Tildel bronze, sølv eller guld til donorer. Farven vises som kant omkring brugerens
        medlemskort på hjemmesiden.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg…" className="pl-8" />
        </div>
        <Button variant={onlyDonors ? "default" : "outline"} size="sm" onClick={() => setOnlyDonors((v) => !v)}>
          Kun donorer
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map((r) => (
            <Card key={r.id} className={donationBorderClass(r.donation_tier)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {r.display_name ?? "Uden navn"}
                  {r.lmu_name ? <span className="ml-2 text-xs text-muted-foreground">({r.lmu_name})</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Select
                  value={r.donation_tier ?? "none"}
                  onValueChange={(v) => save(r.id, { tier: v === "none" ? null : (v as DonationTier) })}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    <SelectItem value="bronze">{TIER_LABEL.bronze}</SelectItem>
                    <SelectItem value="silver">{TIER_LABEL.silver}</SelectItem>
                    <SelectItem value="gold">{TIER_LABEL.gold}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-32"
                  placeholder="kr. i alt"
                  defaultValue={r.donation_total_dkk || ""}
                  onBlur={(e) => {
                    const n = Number(e.target.value || 0);
                    if (n !== r.donation_total_dkk) save(r.id, { totalDkk: n });
                  }}
                />
                <Input
                  className="flex-1 min-w-[200px]"
                  placeholder="Note (valgfri)"
                  defaultValue={r.donation_note ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== (r.donation_note ?? null)) save(r.id, { note: v });
                  }}
                />
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen brugere matcher.</p>
          )}
        </div>
      )}
    </div>
  );
}
