import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStripeStatus, resolveSyncError, runStripeAction } from "@/lib/finance/finance.functions";
import { dkk, StatusBadge, useAction } from "./shared";

export function StripeTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const [env, setEnv] = useState<"live" | "sandbox">("live");
  const fn = useServerFn(getStripeStatus);
  const { data } = useQuery({ queryKey: ["fin", "stripe", env], queryFn: () => fn({ data: { env } }) });
  const run = useAction(useServerFn(runStripeAction), ["fin"]);
  const resolve = useAction(useServerFn(resolveSyncError), ["fin"]);
  const [last, setLast] = useState<any>(null);
  const act = (action: string) => run.mutate({ data: { env, action } } as any, { onSuccess: (r: any) => setLast(r) });
  const hist = (data?.state as any[] | undefined)?.find((s) => s.object_type === "balance_transaction_history");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={env === "live" ? "default" : "outline"} onClick={() => setEnv("live")}>Live</Button>
        <Button variant={env === "sandbox" ? "default" : "outline"} onClick={() => setEnv("sandbox")}>Test</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Synkronisering ({env === "live" ? "live" : "test"})</CardTitle>
          <CardDescription>Kun balance transactions bogføres. Betaling, faktura, charge og session gemmes som kontekst. Den daglige kontrol kører automatisk og følger også ældre uafklarede betalinger, refunds, disputes og udbetalinger.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!isFinAdmin || run.isPending} onClick={() => act("access")}>Tjek adgang</Button>
            <Button disabled={!isFinAdmin || run.isPending} onClick={() => act("history")}>{hist?.completed ? "Historik importeret" : hist?.cursor ? "Fortsæt historikimport" : "Start historikimport"}</Button>
            <Button variant="outline" disabled={!isFinAdmin || run.isPending} onClick={() => act("recent")}>Kontrollér seneste 35 dage</Button>
            <Button variant="outline" disabled={!isFinAdmin || run.isPending} onClick={() => act("unresolved")}>Følg uafklarede</Button>
            <Button variant="outline" disabled={!isFinAdmin || run.isPending} onClick={() => act("inbox")}>Behandl webhook-indbakke</Button>
          </div>
          {run.isPending && <p className="text-sm text-muted-foreground">Arbejder… (historikken importeres i bidder; tryk igen for at fortsætte)</p>}
          {last && <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(last.result ?? last, null, 2)}</pre>}
          {data?.access && (
            <div className="space-y-1 text-sm">
              <div className="font-medium">Adgang tjekket {new Date(data.access.checked_at).toLocaleString("da-DK")}</div>
              {(data.access.results as any[]).map((r) => <div key={r.name} className="flex items-center gap-2"><StatusBadge ok={r.ok}>{r.ok ? "OK" : "Mangler"}</StatusBadge>{r.name}{r.error ? <span className="text-xs text-destructive">{r.error}</span> : null}</div>)}
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.errors?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Fejllog</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data!.errors as any[]).map((e) => (
              <div key={e.id} className="flex items-start gap-2"><span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("da-DK")}</span><span className="flex-1">{e.context}: {e.message}</span>{isFinAdmin && <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ data: { id: e.id } } as any)}>Løst</Button>}</div>
            ))}
            <p className="text-xs text-muted-foreground">Genkørsel er sikker: samme bevægelse bogføres aldrig to gange.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Bevægelser i Stripe-beholdningen</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Dato</th><th>ID</th><th>Kategori</th><th className="text-right">Beløb</th><th>Status</th><th>Regnskab</th></tr></thead>
            <tbody>{((data?.transactions ?? []) as any[]).map((t) => (
              <tr key={t.stripe_id} className="border-t border-border">
                <td>{t.stripe_created_at?.slice(0, 10)}</td><td className="font-mono">{t.stripe_id}</td><td>{t.reporting_category}</td>
                <td className="text-right tabular-nums">{t.currency?.toLowerCase() === "dkk" ? dkk(t.amount_minor) : `${t.amount_minor} ${t.currency}`}</td>
                <td>{t.status === "pending" ? "Afventer" : "Tilgængelig"}</td>
                <td>{t.is_historical ? <Badge variant="outline">Historik – kun dokumentation</Badge>
                  : !t.entry ? <Badge variant="destructive">Ikke behandlet</Badge>
                  : t.entry.status === "posted" ? <Badge variant="secondary">Bogført</Badge>
                  : t.entry.needs_review ? <Badge variant="destructive" title={t.entry.review_reason}>Kræver kontrol</Badge>
                  : <Badge variant="outline" title={t.entry.rule_explanation}>Kladde</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
          {(data?.transactions?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Ingen bevægelser hentet endnu.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Webhook-events</CardTitle><CardDescription>Gentagne events ignoreres. Hvert event behandles ved at hente objektet frisk fra Stripe, så rækkefølgen er ligegyldig.</CardDescription></CardHeader>
        <CardContent className="text-xs">
          {((data?.events ?? []) as any[]).map((e) => <div key={e.event_id}>{new Date(e.received_at).toLocaleString("da-DK")} · {e.type} · {e.processed_at ? "behandlet" : `afventer (${e.attempts} forsøg)`}{e.last_error ? ` · ${e.last_error}` : ""}</div>)}
          {(data?.events?.length ?? 0) === 0 && <p className="text-muted-foreground">Ingen events modtaget endnu.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
