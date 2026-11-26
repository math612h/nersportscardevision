import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Download, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aggregateStandings, compareStandings, type StandingsEntry } from "@/lib/league-standings";
import { isResultsPublished } from "@/lib/results-visibility";
import logoAsset from "@/assets/lmu-logo.png.asset.json";

type Row = { pos: number; name: string; number: number | null; team: string | null; points: number };

// Billedets farver (tegnes på canvas, ikke i app-temaet).
const C = {
  bg1: "#06121f", bg2: "#0b2238", accent: "#38bdf8", text: "#f1f5f9", muted: "#94a3b8",
  row: "rgba(255,255,255,0.04)", gold: "#f5c542", silver: "#cbd5e1", bronze: "#d08a4a",
};
const MEDAL = [C.gold, C.silver, C.bronze];

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

async function drawStandings(canvas: HTMLCanvasElement, opts: { league: string; classLabel: string; subtitle: string; rows: Row[] }) {
  const W = 1080, PAD = 60, HEAD = 330, ROW = 72, FOOT = 110;
  const H = HEAD + Math.max(1, opts.rows.length) * ROW + FOOT;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // diagonale racerstriber
  ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = C.accent;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(W - 380 + i * 70, 0); ctx.lineTo(W - 340 + i * 70, 0); ctx.lineTo(W - 640 + i * 70, H); ctx.lineTo(W - 680 + i * 70, H); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 8);

  const logo = await loadImage((logoAsset as any).url);
  if (logo) { const h = 90, w = (logo.width / logo.height) * h; ctx.drawImage(logo, PAD, 44, w, h); }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.muted; ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "right"; ctx.fillText("LMU DANMARK", W - PAD, 80);
  ctx.fillText(fit(ctx, opts.league.toUpperCase(), 520), W - PAD, 112);
  ctx.textAlign = "left";
  ctx.fillStyle = C.muted; ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText("MESTERSKABSSTILLING", PAD, 200);
  // tydelig klasse-badge
  ctx.font = "900 64px system-ui, sans-serif";
  const cw = ctx.measureText(opts.classLabel).width;
  ctx.fillStyle = C.accent; ctx.beginPath(); ctx.roundRect(PAD - 4, 214, cw + 44, 84, 14); ctx.fill();
  ctx.fillStyle = C.bg1; ctx.fillText(opts.classLabel, PAD + 18, 280);
  ctx.fillStyle = C.muted; ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(opts.subtitle, PAD + cw + 70, 268);

  // kolonner
  const xPos = PAD + 40, xName = PAD + 110, xTeam = 600, xPts = W - PAD - 20;
  ctx.fillStyle = C.muted; ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("POS", PAD + 18, HEAD - 6); ctx.fillText("KØRER", xName, HEAD - 6); ctx.fillText("TEAM", xTeam, HEAD - 6);
  ctx.textAlign = "right"; ctx.fillText("POINT", xPts, HEAD - 6); ctx.textAlign = "left";

  opts.rows.forEach((r, i) => {
    const y = HEAD + 8 + i * ROW;
    const top3 = r.pos <= 3;
    ctx.fillStyle = top3 ? `${MEDAL[r.pos - 1]}22` : i % 2 ? "transparent" : C.row;
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, ROW - 8, 10); ctx.fill();
    const cy = y + (ROW - 8) / 2;
    if (top3) {
      const col = MEDAL[r.pos - 1];
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(xPos - 12, cy - 30); ctx.lineTo(xPos - 4, cy - 14); ctx.lineTo(xPos + 4, cy - 14); ctx.lineTo(xPos + 12, cy - 30); ctx.fill();
      ctx.beginPath(); ctx.arc(xPos, cy + 3, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.bg1; ctx.font = "900 22px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(r.pos), xPos, cy + 11); ctx.textAlign = "left";
    } else {
      ctx.fillStyle = C.text; ctx.font = "800 26px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(r.pos), xPos, cy + 9); ctx.textAlign = "left";
    }
    ctx.fillStyle = C.text; ctx.font = `${top3 ? 800 : 600} 26px system-ui, sans-serif`;
    const num = r.number != null ? `#${r.number} ` : "";
    ctx.fillText(fit(ctx, num + r.name, xTeam - xName - 20), xName, cy + 9);
    ctx.fillStyle = C.muted; ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText(fit(ctx, r.team ?? "—", xPts - xTeam - 120), xTeam, cy + 8);
    ctx.fillStyle = top3 ? MEDAL[r.pos - 1] : C.text; ctx.font = "900 28px system-ui, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(String(r.points), xPts, cy + 10); ctx.textAlign = "left";
  });
  if (opts.rows.length === 0) { ctx.fillStyle = C.muted; ctx.font = "500 24px system-ui"; ctx.fillText("Ingen resultater endnu.", PAD, HEAD + 50); }

  ctx.fillStyle = C.accent; ctx.fillRect(PAD, H - FOOT + 30, W - PAD * 2, 2);
  ctx.fillStyle = C.muted; ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("lmudanmark.dk", PAD, H - 40);
  ctx.textAlign = "right"; ctx.fillText(new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }), W - PAD, H - 40); ctx.textAlign = "left";
}

export function ShareStandingsImageButton({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ImageIcon className="h-3 w-3 mr-1" /> Del stilling som billede
      </Button>
      {open && <ShareDialog leagueId={leagueId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ leagueId, onClose }: { leagueId: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cls, setCls] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);

  const { data } = useQuery({
    queryKey: ["share-standings", leagueId],
    queryFn: async () => {
      const [{ data: league }, { data: divisions }, { data: entries }] = await Promise.all([
        supabase.from("leagues").select("name,points_system").eq("id", leagueId).single(),
        supabase.from("divisions").select("id,name,settings,race_date").eq("league_id", leagueId).order("race_date", { ascending: true, nullsFirst: false }),
        supabase.from("entries").select("user_id,car_class,driver_category,car_number,team_id,withdrawn_at,division_id").eq("league_id", leagueId),
      ]);
      const teamIds = Array.from(new Set((entries ?? []).map((e: any) => e.team_id).filter(Boolean)));
      const { data: teams } = teamIds.length ? await supabase.from("teams").select("id,name").in("id", teamIds) : { data: [] as any[] };
      return { league, divisions: divisions ?? [], entries: (entries ?? []) as any[], teams: Object.fromEntries((teams ?? []).map((t: any) => [t.id, t.name])) as Record<string, string> };
    },
  });

  const computed = useMemo(() => {
    if (!data) return null;
    const completed = data.divisions.filter((d: any) => d.settings?.completed && isResultsPublished(d.settings) && Array.isArray(d.settings?.results));
    const drop = Math.max(0, Number((data.league?.points_system as any)?.drop_rounds ?? 0)) || 0;
    const all = aggregateStandings(completed, data.entries as StandingsEntry[], drop);
    const cur = new Map<string, any>();
    for (const e of data.entries) if (!e.division_id && (!cur.has(`${e.user_id}|${e.car_class}`) || !e.withdrawn_at)) cur.set(`${e.user_id}|${e.car_class}`, e);
    const groups = new Map<string, Row[]>();
    const keys = Array.from(new Set(all.map((r) => `${r.car_class}|${r.driver_category}`))).sort();
    for (const k of keys) {
      const rows = all.filter((r) => `${r.car_class}|${r.driver_category}` === k).sort(compareStandings);
      groups.set(k, rows.map((r, i) => {
        const e = r.user_id ? cur.get(`${r.user_id}|${r.car_class}`) : undefined;
        return { pos: i + 1, name: r.driver_name, number: e?.car_number ?? r.car_number, team: e?.team_id ? data.teams[e.team_id] ?? null : null, points: r.total };
      }));
    }
    const last = completed[completed.length - 1] as any;
    return { groups, keys, subtitle: last ? `Efter ${last.name} · ${completed.length} afd.` : "Ingen afdelinger kørt" };
  }, [data]);

  useEffect(() => { if (computed && !cls && computed.keys[0]) setCls(computed.keys[0]); }, [computed, cls]);

  useEffect(() => {
    if (!computed || !cls || !canvasRef.current) return;
    const [c, cat] = cls.split("|");
    const label = [c, cat].filter(Boolean).join(" ");
    setBlob(null);
    void drawStandings(canvasRef.current, { league: data?.league?.name ?? "", classLabel: label, subtitle: computed.subtitle, rows: computed.groups.get(cls) ?? [] })
      .then(() => canvasRef.current?.toBlob((b) => setBlob(b), "image/png"));
  }, [computed, cls, data]);

  const fileName = `stilling-${cls.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  const download = () => { if (!blob) return; const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); };
  const copy = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]); toast.success("Billedet er kopieret."); }
    catch { toast.error("Kunne ikke kopiere – brug Download i stedet."); }
  };
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Del stilling som billede</DialogTitle>
          <DialogDescription>Samlet mesterskabsstilling for den valgte klasse.</DialogDescription>
        </DialogHeader>
        {!computed ? <p className="text-sm text-muted-foreground">Henter stilling…</p> : computed.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Der er ingen offentliggjorte resultater endnu.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Klasse</Label>
              <Select value={cls} onValueChange={setCls}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {computed.keys.map((k) => <SelectItem key={k} value={k}>{k.split("|").filter(Boolean).join(" ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <canvas ref={canvasRef} className="w-full rounded-md border border-border" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={download} disabled={!blob}><Download className="h-3 w-3 mr-1" /> Download</Button>
              <Button size="sm" variant="outline" onClick={copy} disabled={!blob}><Copy className="h-3 w-3 mr-1" /> Kopiér</Button>
              {canShare && <Button size="sm" variant="outline" onClick={() => navigator.share({ files: [file!] }).catch(() => {})}><Share2 className="h-3 w-3 mr-1" /> Del</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
