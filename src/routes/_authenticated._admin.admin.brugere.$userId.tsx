import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, Shield, MapPin, Mail, Calendar, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminGetUserData } from "@/lib/admin-user-data.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/brugere/$userId")({
  component: AdminUserDetailPage,
});

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("da-DK"); } catch { return v; }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

function AdminUserDetailPage() {
  const { userId } = useParams({ from: "/_authenticated/_admin/admin/brugere/$userId" });
  const fetchData = useServerFn(adminGetUserData);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-data", userId],
    queryFn: () => fetchData({ data: { userId } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/brugere">
          <Button variant="outline" size="icon" aria-label="Tilbage">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <User className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Brugerdata</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Indlæser…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {data && (
        <div className="space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" /> Profil
              </CardTitle>
              <div className="flex gap-1">
                {data.roles.map((r) => (
                  <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs">
                    {r === "admin" && <Shield className="mr-1 h-3 w-3" />}{r}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Field label="Visningsnavn" value={(data.profile as any)?.display_name} />
              <Field label="LMU-navn" value={(data.profile as any)?.lmu_name} />
              <Field label="Godkendt" value={(data.profile as any)?.approved ? "Ja" : "Nej"} />
              <Field label="Accepterer dansk" value={(data.profile as any)?.accepts_danish ? "Ja" : "Nej"} />
              <Field label="Media-samtykke" value={(data.profile as any)?.media_consent ? "Ja" : "Nej"} />
              <Field label="Bio" value={(data.profile as any)?.bio} />
              <Field label="Achievements" value={(data.profile as any)?.achievements} />
              <Field label="Oprettet" value={fmtDate((data.profile as any)?.created_at)} />
            </CardContent>
          </Card>

          {/* Auth */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" /> Konto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Email" value={data.auth.email} />
              <Field label="Bekræftet" value={fmtDate(data.auth.confirmed_at)} />
              <Field label="Sidste login" value={fmtDate(data.auth.last_sign_in_at)} />
              <Field label="Oprettet" value={fmtDate(data.auth.created_at)} />
            </CardContent>
          </Card>

          {/* Private (GDPR) */}
          <Card className="border-amber-500/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" /> Personfølsomme oplysninger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Alder" value={(data.private as any)?.age} />
              <Field label="Discord-bruger" value={(data.private as any)?.discord_username} />
              <Field label="Discord-server-nick" value={(data.private as any)?.discord_server_nickname} />
              <Field label="Discord ID" value={(data.private as any)?.discord_user_id} />
              <Field label="Discord tilknyttet" value={fmtDate((data.private as any)?.discord_linked_at)} />
              <Field label="Adresse" value={(data.private as any)?.address} />
              <Field label="Postnummer" value={(data.private as any)?.postal_code} />
              <Field label="By" value={(data.private as any)?.city} />
              <Field label="Land" value={(data.private as any)?.country} />
              <Field
                label="Adresse-samtykke"
                value={
                  (data.private as any)?.address_consent_at
                    ? fmtDate((data.private as any).address_consent_at)
                    : <span className="text-amber-600">Ikke givet</span>
                }
              />
            </CardContent>
          </Card>

          {/* Rating */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" /> Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Elo score" value={(data.rating as any)?.score ?? "—"} />
              <Field label="Percentil" value={(data.rating as any)?.percentile ?? "—"} />
              <Field label="Antal løb (Elo)" value={(data.rating as any)?.races_count ?? "—"} />
              {data.classRatings.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Klasse-ratings</p>
                  {data.classRatings.map((c: any) => (
                    <div key={c.car_class} className="flex justify-between text-sm">
                      <span>{c.car_class}</span>
                      <span className="font-mono">
                        {Number(c.score).toFixed(1)} ({Number(c.percentile ?? 0).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Teams */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Teams ({data.teams.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.teams.length === 0 ? (
                <p className="text-muted-foreground">Ingen teams.</p>
              ) : data.teams.map((t: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span>{t.teams?.name ?? "(ukendt)"}</span>
                  <Badge variant="outline" className="text-xs">{t.role}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Entries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tilmeldinger (seneste 50)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.entries.length === 0 ? (
                <p className="text-muted-foreground">Ingen tilmeldinger.</p>
              ) : data.entries.map((e: any) => (
                <div key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1 last:border-0">
                  <span className="font-medium">{e.leagues?.name ?? "(ukendt liga)"}</span>
                  <span className="text-muted-foreground">
                    #{e.car_number} · {e.car_class}
                    {e.driver_category ? ` · ${e.driver_category}` : ""}
                    {e.waitlist ? " · venteliste" : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aktivitet</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Leaderboard-tider" value={data.leaderboardCount} />
              <Field label="Race-resultater" value={data.resultsCount} />
              <Field label="Device-tokens" value={data.deviceTokens.length} />
            </CardContent>
          </Card>

          {/* Audit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" /> Audit-log (seneste 50)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {data.audit.length === 0 ? (
                <p className="text-muted-foreground">Ingen audit-poster.</p>
              ) : data.audit.map((a: any) => (
                <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1 last:border-0 font-mono">
                  <span>{fmtDate(a.created_at)}</span>
                  <span>{a.action} · {a.table_name}</span>
                  <span className="text-muted-foreground">{a.actor_label ?? "system"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
