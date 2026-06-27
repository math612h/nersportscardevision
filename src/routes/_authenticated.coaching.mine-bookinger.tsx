import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMyBookingsAsUser, cancelMyBooking } from "@/lib/coaching.functions";

export const Route = createFileRoute("/_authenticated/coaching/mine-bookinger")({
  component: MyBookingsPage,
});

function MyBookingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyBookingsAsUser);
  const cancelFn = useServerFn(cancelMyBooking);
  const { data: bookings = [] } = useQuery({ queryKey: ["my-coaching-bookings"], queryFn: () => listFn() });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success("Aflyst"); qc.invalidateQueries({ queryKey: ["my-coaching-bookings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/coaching"><ArrowLeft className="mr-1 h-4 w-4" /> Coaching</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/coaching/book"><Plus className="mr-1 h-4 w-4" /> Ny booking</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold">Mine coaching-bookinger</h1>
      <div className="mt-6 space-y-3">
        {bookings.length === 0 && <p className="text-sm text-muted-foreground">Ingen bookinger endnu.</p>}
        {(bookings as any[]).map((b) => (
          <Card key={b.id}>
            <CardContent className="space-y-1 pt-6 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{new Date(b.starts_at).toLocaleString("da-DK", { dateStyle: "full", timeStyle: "short" })}</div>
                <StatusBadge status={b.status} />
              </div>
              <div className="text-muted-foreground">Coach: <strong className="text-foreground">{b.coach?.display_name ?? "Coach"}</strong> · {b.duration_minutes} min · {b.track}{b.layout ? ` — ${b.layout}` : ""}</div>
              <div className="flex flex-wrap gap-1">
                {(b.focus_points ?? []).slice(0, 6).map((f: string) => <Badge key={f} variant="secondary">{f}</Badge>)}
                {(b.focus_points ?? []).length > 6 && <Badge variant="outline">+{b.focus_points.length - 6}</Badge>}
              </div>
              {b.rejection_reason && (
                <p className="text-xs text-destructive"><strong>Afvist:</strong> {b.rejection_reason}</p>
              )}
              {(b.status === "pending" || b.status === "confirmed") && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => { if (confirm("Aflys denne booking?")) cancelMut.mutate(b.id); }}>
                    Aflys
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Afventer coach", variant: "outline" },
    confirmed: { label: "Bekræftet", variant: "default" },
    rejected: { label: "Afvist", variant: "destructive" },
    cancelled: { label: "Aflyst", variant: "secondary" },
    completed: { label: "Færdig", variant: "secondary" },
  };
  const m = map[status] ?? map.pending;
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
