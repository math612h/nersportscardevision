import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { getMyArchive } from "@/lib/rating.functions";

function fmtLap(ms: number | null | undefined) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
}

export function PersonalBestPanel() {
  const { user } = useAuth();
  const fetchArchive = useServerFn(getMyArchive);
  const { data, isLoading } = useQuery({
    queryKey: ["my-archive-leaderboard", user?.id],
    enabled: !!user,
    queryFn: () => fetchArchive(),
  });

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Log ind</Link> for at se dine personlige bedste tider.
        </CardContent>
      </Card>
    );
  }
  if (isLoading) return <p className="py-4 text-sm text-muted-foreground">Indlæser…</p>;

  const best = data?.best ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mine personlige bedste tider</CardTitle>
          <CardDescription>Din hurtigste runde pr. bane og bilklasse, uanset session.</CardDescription>
        </CardHeader>
        <CardContent>
          {best.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen tider endnu. Brug companion-appen eller deltag i et løb.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bane</TableHead>
                  <TableHead>Klasse</TableHead>
                  <TableHead>Bil</TableHead>
                  <TableHead className="text-right">Bedste runde</TableHead>
                  <TableHead className="hidden sm:table-cell">Sat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {best.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{b.track}{b.layout ? ` (${b.layout})` : ""}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{b.car_class}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{b.car_model ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtLap(b.best_lap_ms)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {b.recorded_at ? new Date(b.recorded_at).toLocaleDateString("da-DK") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Vil du se din udvikling over tid og dine liga-resultater? <Link to="/arkiv" className="text-primary hover:underline">Åbn det fulde arkiv →</Link>
      </p>
    </div>
  );
}
