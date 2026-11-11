import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { addMembershipRate, approveSetup, listFinanceRoles, setFinanceRole, updateFinanceSettings } from "@/lib/finance/finance.functions";
import { searchUsersForAdmin } from "@/lib/league-admin-entries.functions";
import { dkk, parseDkkToMinor, StatusBadge, useAction } from "./shared";
import { useOverview } from "./OverviewTab";

export function SetupTab({ isFinAdmin }: { isFinAdmin: boolean }) {
  const { data } = useOverview();
  const s: any = data?.settings ?? {};
  const upd = useAction(useServerFn(updateFinanceSettings), ["fin"], "Gemt");
  const approve = useAction(useServerFn(approveSetup), ["fin"], "Registreret");
  const addRate = useAction(useServerFn(addMembershipRate), ["fin"], "Sats tilføjet");
  const [cutoff, setCutoff] = useState("");
  const [vat, setVat] = useState<string | null>(null);
  const [rate, setRate] = useState({ amount: "150,00", months: "6", from: "" });
  const cutoffLocal = s.cutoff_at ? new Date(s.cutoff_at).toISOString().slice(0, 16) : "";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Foreningen</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>Navn: <b>{s.org_name}</b></div>
          <div>Regnskabsår: kalenderår</div>
          <div>Stiftet: {s.founded_on}</div>
          <div>Kasserer: {s.treasurer_name}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skæringspunkt</CardTitle>
          <CardDescription>Stripe-bevægelser før dette tidspunkt er kun dokumentation og indgår i den overtagne beholdning. Ændres skæringspunktet, skal det godkendes igen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Tidspunkt (dansk tid)</Label><Input type="datetime-local" defaultValue={cutoffLocal} onChange={(e) => setCutoff(e.target.value)} disabled={!isFinAdmin} /></div>
            <Button disabled={!isFinAdmin || !cutoff} onClick={() => upd.mutate({ data: { cutoff_at: new Date(cutoff).toISOString() } } as any)}>Gem</Button>
            <Button variant="secondary" disabled={!isFinAdmin || !s.cutoff_at || !!s.cutoff_approved_at} onClick={() => approve.mutate({ data: { what: "cutoff" } } as any)}>Godkend skæringspunkt</Button>
          </div>
          <div className="text-sm">
            {s.cutoff_at ? <>Nuværende: {new Date(s.cutoff_at).toLocaleString("da-DK")} </> : "Ikke angivet. "}
            <StatusBadge ok={!!s.cutoff_approved_at}>{s.cutoff_approved_at ? `Godkendt ${new Date(s.cutoff_approved_at).toLocaleDateString("da-DK")}` : "Ikke godkendt"}</StatusBadge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatisk bogføring</CardTitle>
          <CardDescription>Når den er slået til, bogføres Stripe-bevægelser med en entydig regel automatisk. Ukendte typer sendes altid til kontrol.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <StatusBadge ok={s.auto_posting_enabled ? true : "warn"}>{s.auto_posting_enabled ? "Slået til" : "Slået fra"}</StatusBadge>
          <StatusBadge ok={!!s.rules_approved_at}>Regler {s.rules_approved_at ? "godkendt" : "ikke godkendt"}</StatusBadge>
          <Button variant="secondary" disabled={!isFinAdmin || !!s.rules_approved_at} onClick={() => approve.mutate({ data: { what: "rules" } } as any)}>Godkend de aktive regler</Button>
          {s.auto_posting_enabled
            ? <Button variant="outline" disabled={!isFinAdmin} onClick={() => approve.mutate({ data: { what: "auto_posting_off" } } as any)}>Slå fra</Button>
            : <Button disabled={!isFinAdmin} onClick={() => approve.mutate({ data: { what: "auto_posting_on" } } as any)}>Slå automatisk bogføring til</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kontingent</CardTitle><CardDescription>Satsen er en indstilling med historik. Der oprettes ingen abonnementer eller automatiske korttræk.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <ul className="text-sm">{(data?.rates ?? []).map((r: any) => <li key={r.id}>Fra {r.effective_from}: {dkk(r.amount_minor)} for {r.period_months} måneder{r.note ? ` – ${r.note}` : ""}</li>)}</ul>
          {isFinAdmin && (
            <div className="flex flex-wrap items-end gap-2">
              <div><Label>Beløb</Label><Input value={rate.amount} onChange={(e) => setRate({ ...rate, amount: e.target.value })} className="w-28" /></div>
              <div><Label>Måneder</Label><Input value={rate.months} onChange={(e) => setRate({ ...rate, months: e.target.value })} className="w-20" /></div>
              <div><Label>Gælder fra</Label><Input type="date" value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} /></div>
              <Button disabled={!rate.from} onClick={() => addRate.mutate({ data: { amount_minor: parseDkkToMinor(rate.amount), period_months: Number(rate.months), effective_from: rate.from } } as any)}>Tilføj ny sats</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Moms og skat</CardTitle><CardDescription>Systemet antager ikke momsfritagelse og laver ingen indberetning. Notér kassererens konkrete afklaring her.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={4} value={vat ?? s.vat_note ?? ""} onChange={(e) => setVat(e.target.value)} disabled={!isFinAdmin} placeholder="Fx: Afklaret med SKAT den …, fordi …" />
          <div className="flex gap-2">
            <Button variant="outline" disabled={!isFinAdmin || vat === null} onClick={() => upd.mutate({ data: { vat_note: vat } } as any)}>Gem note</Button>
            <Button variant="secondary" disabled={!isFinAdmin || !s.vat_note} onClick={() => approve.mutate({ data: { what: "vat" } } as any)}>Markér som afklaret</Button>
            <StatusBadge ok={s.vat_confirmed_at ? true : "warn"}>{s.vat_confirmed_at ? "Afklaret" : "Ikke afklaret"}</StatusBadge>
          </div>
        </CardContent>
      </Card>

      <RolesCard />
    </div>
  );
}

export function RolesCard() {
  const list = useServerFn(listFinanceRoles);
  const { data: roles = [] } = useQuery({ queryKey: ["fin", "roles"], queryFn: () => list() });
  const set = useAction(useServerFn(setFinanceRole), ["fin"], "Opdateret");
  const search = useServerFn(searchUsersForAdmin);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Økonomirettigheder</CardTitle>
        <CardDescription>Kasserer: kan bogføre og ændre. Godkender: kan se alt og godkende udlæg og regnskab. Kun administratorer kan tildele rettigheder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {(roles as any[]).map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span>{r.name}</span><Badge variant="secondary">{r.role === "finance_admin" ? "Kasserer" : "Godkender"}</Badge>
              <Button size="sm" variant="ghost" onClick={() => set.mutate({ data: { userId: r.user_id, role: r.role, grant: false } } as any)}>Fjern</Button>
            </li>
          ))}
          {(roles as any[]).length === 0 && <li className="text-muted-foreground">Ingen har økonomirettigheder endnu.</li>}
        </ul>
        <div className="flex gap-2">
          <Input placeholder="Søg bruger…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline" disabled={q.length < 2} onClick={async () => setHits(await search({ data: { q } }))}>Søg</Button>
        </div>
        {hits.map((h) => (
          <div key={h.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{h.display_name ?? h.lmu_name}</span>
            <Button size="sm" variant="outline" onClick={() => set.mutate({ data: { userId: h.id, role: "finance_admin", grant: true } } as any)}>Gør til kasserer</Button>
            <Button size="sm" variant="outline" onClick={() => set.mutate({ data: { userId: h.id, role: "finance_approver", grant: true } } as any)}>Gør til godkender</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
