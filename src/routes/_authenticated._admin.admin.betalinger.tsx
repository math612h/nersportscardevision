import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Receipt, Search, RotateCcw, ExternalLink, CreditCard, Coffee, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { listAllPayments, getPaymentsStats, refundPayment } from "@/lib/payments-admin.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/_admin/admin/betalinger")({
  component: AdminPaymentsPage,
});

type Row = {
  id: string;
  user_id: string;
  amount_dkk: number;
  refunded_amount_dkk: number | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
  source: "donation" | "coaching" | null;
  note: string | null;
  donated_at: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  environment: "sandbox" | "live" | null;
  profiles: { display_name: string | null; lmu_name: string | null } | null;
};

function formatDkk(n: number) {
  return `${n.toLocaleString("da-DK")} kr.`;
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function RefundDialog({
  row,
  open,
  onOpenChange,
  onDone,
}: {
  row: Row | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const refundFn = useServerFn(refundPayment);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const remaining = row ? row.amount_dkk - (row.refunded_amount_dkk ?? 0) : 0;

  const submit = async (fullRefund: boolean) => {
    if (!row) return;
    const parsed = fullRefund ? undefined : Math.round(Number(amount));
    if (!fullRefund && (!Number.isFinite(parsed) || !parsed || parsed <= 0)) {
      toast.error("Angiv et gyldigt beløb");
      return;
    }
    setBusy(true);
    try {
      const res = await refundFn({
        data: {
          donationId: row.id,
          amountDkk: parsed,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(`Refunderet ${res.refundDkk} kr.`);
        onOpenChange(false);
        setAmount("");
        onDone();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Refundering fejlede");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refunder betaling</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="rounded border bg-muted/40 p-3">
              <div className="font-medium">
                {row.profiles?.display_name ?? "Uden navn"}
                {row.profiles?.lmu_name && (
                  <span className="ml-2 text-xs text-muted-foreground">({row.profiles.lmu_name})</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Oprindeligt beløb: {formatDkk(row.amount_dkk)} · Kan stadig refunderes: {formatDkk(remaining)}
              </div>
              {!row.stripe_payment_intent_id && (
                <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  Denne betaling er registreret manuelt (ingen Stripe-transaktion). Refundering
                  markerer den kun som refunderet — pengeoverførsel skal håndteres udenom.
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Delvist beløb (kr.) — lad stå tom for fuld refundering</label>
              <Input
                type="number"
                min={1}
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Fuld: ${remaining}`}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annullér
          </Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={busy || !amount}>
            Refunder {amount ? `${amount} kr.` : "delvist"}
          </Button>
          <Button variant="destructive" onClick={() => submit(true)} disabled={busy}>
            Refunder fuldt ({formatDkk(remaining)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminPaymentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllPayments);
  const statsFn = useServerFn(getPaymentsStats);

  const [source, setSource] = useState<"all" | "donation" | "coaching" | "manual">("all");
  const [status, setStatus] = useState<"all" | "refunded" | "not_refunded">("all");
  const [q, setQ] = useState("");
  const [refundRow, setRefundRow] = useState<Row | null>(null);

  const { data: statsData } = useQuery({
    queryKey: ["admin-payments-stats"],
    queryFn: () => statsFn(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", source, status, q],
    queryFn: () => listFn({ data: { source, status, q } }),
  });

  const rows = (data?.rows ?? []) as Row[];
  const stats = statsData ?? { grossTotal: 0, refundedTotal: 0, netTotal: 0, countAll: 0, countRefunded: 0, monthNet: 0, donationsNet: 0, coachingNet: 0 };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
    qc.invalidateQueries({ queryKey: ["admin-payments-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-donations"] });
    qc.invalidateQueries({ queryKey: ["donation-tier"] });
  };

  const stripeDashboardUrl = (row: Row) => {
    if (!row.stripe_payment_intent_id) return null;
    const base = row.environment === "live"
      ? "https://dashboard.stripe.com"
      : "https://dashboard.stripe.com/test";
    return `${base}/payments/${row.stripe_payment_intent_id}`;
  };

  const exportCsv = () => {
    const header = ["Dato", "Navn", "LMU-navn", "Type", "Beløb (kr.)", "Refunderet (kr.)", "Note", "Stripe PI", "Miljø"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        new Date(r.donated_at).toLocaleString("da-DK"),
        r.profiles?.display_name ?? "",
        r.profiles?.lmu_name ?? "",
        r.source ?? "",
        r.amount_dkk,
        r.refunded_amount_dkk ?? 0,
        (r.note ?? "").replace(/;/g, ","),
        r.stripe_payment_intent_id ?? "",
        r.environment ?? "",
      ].join(";"));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `betalinger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCount = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 text-primary">
        <Receipt className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Betalinger & donationer</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Oversigt over alle registrerede betalinger — både Stripe-transaktioner (donationer og
        coaching) og manuelt registrerede donationer. Du kan refundere Stripe-betalinger direkte
        herfra; refunderede beløb trækkes automatisk fra donor-status.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Netto i alt" value={formatDkk(stats.netTotal)} sub={`${stats.countAll} transaktioner`} icon={HandCoins} />
        <StatCard label="Denne måned" value={formatDkk(stats.monthNet)} icon={Receipt} />
        <StatCard label="Donationer / Coaching" value={`${formatDkk(stats.donationsNet)} / ${formatDkk(stats.coachingNet)}`} icon={Coffee} />
        <StatCard label="Refunderet" value={formatDkk(stats.refundedTotal)} sub={`${stats.countRefunded} refunderinger`} icon={RotateCcw} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Søg navn eller LMU-navn…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={source} onValueChange={(v) => setSource(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle typer</SelectItem>
                <SelectItem value="donation">Donation</SelectItem>
                <SelectItem value="coaching">Coaching</SelectItem>
                <SelectItem value="manual">Manuelt registreret</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="not_refunded">Ikke refunderet</SelectItem>
                <SelectItem value="refunded">Refunderet</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              Eksportér CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Viser {filteredCount} betaling{filteredCount === 1 ? "" : "er"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Ingen betalinger matcher filtrene.</p>
          ) : (
            <div className="divide-y">
              {rows.map((row) => {
                const refunded = row.refunded_amount_dkk ?? 0;
                const remaining = row.amount_dkk - refunded;
                const isFullyRefunded = refunded >= row.amount_dkk;
                const isPartial = refunded > 0 && !isFullyRefunded;
                const stripeUrl = stripeDashboardUrl(row);

                return (
                  <div key={row.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <div className="min-w-[180px] flex-1">
                      <div className="font-medium">
                        {row.profiles?.display_name ?? "Ukendt bruger"}
                        {row.profiles?.lmu_name && (
                          <span className="ml-1 text-xs text-muted-foreground">({row.profiles.lmu_name})</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(row.donated_at).toLocaleString("da-DK")}
                        {row.note && <> · {row.note}</>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {row.source === "coaching" ? (
                        <Badge variant="outline" className="gap-1"><Coffee className="h-3 w-3" /> Coaching</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1"><HandCoins className="h-3 w-3" /> Donation</Badge>
                      )}
                      {row.stripe_payment_intent_id ? (
                        <Badge variant="outline" className="gap-1">
                          <CreditCard className="h-3 w-3" /> Stripe
                          {row.environment === "sandbox" && <span className="text-[10px]">(test)</span>}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Manuel</Badge>
                      )}
                      {isFullyRefunded && <Badge variant="destructive">Refunderet</Badge>}
                      {isPartial && <Badge variant="secondary">Delvist refunderet</Badge>}
                    </div>

                    <div className="text-right">
                      <div className={isFullyRefunded ? "text-muted-foreground line-through" : "font-semibold"}>
                        {formatDkk(row.amount_dkk)}
                      </div>
                      {refunded > 0 && (
                        <div className="text-xs text-muted-foreground">
                          -{formatDkk(refunded)} · rest {formatDkk(remaining)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {stripeUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Åbn i Stripe"
                        >
                          <a href={stripeUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRefundRow(row)}
                        disabled={remaining <= 0}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Refunder
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <RefundDialog
        row={refundRow}
        open={!!refundRow}
        onOpenChange={(o) => !o && setRefundRow(null)}
        onDone={refresh}
      />
    </div>
  );
}
