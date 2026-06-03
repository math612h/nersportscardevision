import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, Hand, UserX, Volume2, X, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getBriefingToken,
  grantSpeak,
  revokeSpeak,
  removeParticipant,
} from "@/lib/briefing.functions";

type Props = {
  divisionId: string;
  raceDate: string | null;
  briefingOpenMinutesBefore: number; // default applied at call site
};

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}t ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function DriversBriefing({ divisionId, raceDate, briefingOpenMinutesBefore }: Props) {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const opensAt = useMemo(() => {
    if (!raceDate) return null;
    const race = new Date(raceDate).getTime();
    if (Number.isNaN(race)) return null;
    return race - briefingOpenMinutesBefore * 60 * 1000;
  }, [raceDate, briefingOpenMinutesBefore]);

  if (!user) return null;

  const msUntilOpen = opensAt ? opensAt - now : 0;
  const isOpen = opensAt ? now >= opensAt : false;
  const canEnter = isAdmin || isOpen;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!canEnter}
        className={`group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border-2 px-6 py-4 text-base font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-70 ${
          isOpen
            ? "border-primary bg-primary text-primary-foreground hover:brightness-110 animate-pulse"
            : "border-primary/60 bg-primary/20 text-foreground hover:bg-primary/30"
        }`}
      >
        <Radio className="h-6 w-6" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-lg">Drivers Briefing</span>
          {!isOpen && opensAt && (
            <span className="text-xs font-medium opacity-80">
              Åbner om {fmtCountdown(msUntilOpen)}
            </span>
          )}
          {isOpen && (
            <span className="text-xs font-medium opacity-90">Tryk for at deltage nu</span>
          )}
          {!opensAt && (
            <span className="text-xs font-medium opacity-80">Race-dato mangler</span>
          )}
        </span>
      </button>

      {open && (
        <BriefingRoomDialog
          divisionId={divisionId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BriefingRoomDialog({ divisionId, onClose }: { divisionId: string; onClose: () => void }) {
  const fetchToken = useServerFn(getBriefingToken);
  const [conn, setConn] = useState<{ token: string; url: string; isAdmin: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchToken({ data: { divisionId } })
      .then((res) => {
        if (alive) setConn({ token: res.token, url: res.url, isAdmin: res.isAdmin });
      })
      .catch((e) => alive && setErr(e?.message ?? "Kunne ikke forbinde"));
    return () => {
      alive = false;
    };
  }, [divisionId, fetchToken]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" /> Drivers Briefing
          </DialogTitle>
        </DialogHeader>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!conn && !err && <p className="text-sm text-muted-foreground">Forbinder…</p>}
        {conn && (
          <LiveKitRoom
            token={conn.token}
            serverUrl={conn.url}
            connect
            audio={conn.isAdmin}
            video={false}
            onError={(e) => setErr(e.message)}
          >
            <RoomAudioRenderer />
            <BriefingRoomUI divisionId={divisionId} isAdmin={conn.isAdmin} />
          </LiveKitRoom>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Speaker = {
  identity: string;
  name: string;
  avatarUrl: string | null;
  isSpeaking: boolean;
};

function BriefingRoomUI({ divisionId, isAdmin }: { divisionId: string; isAdmin: boolean }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const audioTracks = useTracks([Track.Source.Microphone]);
  const qc = useQueryClient();

  const grantFn = useServerFn(grantSpeak);
  const revokeFn = useServerFn(revokeSpeak);
  const removeFn = useServerFn(removeParticipant);

  const handsKey = ["briefing-hands", divisionId];
  const { data: hands } = useQuery({
    queryKey: handsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefing_raised_hands")
        .select("user_id, raised_at")
        .eq("division_id", divisionId)
        .order("raised_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`briefing-hands-${divisionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "briefing_raised_hands", filter: `division_id=eq.${divisionId}` },
        () => qc.invalidateQueries({ queryKey: handsKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [divisionId, qc]);

  const meta = (p: { metadata?: string | null; identity: string; name?: string }) => {
    try {
      const m = p.metadata ? JSON.parse(p.metadata) : {};
      return {
        name: (m.display_name as string) || p.name || "Kører",
        avatarUrl: (m.avatar_url as string | null) ?? null,
        isAdmin: !!m.is_admin,
      };
    } catch {
      return { name: p.name ?? "Kører", avatarUrl: null, isAdmin: false };
    }
  };

  const speakingIds = new Set(
    audioTracks
      .filter((t) => t.participant.isSpeaking)
      .map((t) => t.participant.identity),
  );

  const speakers: Speaker[] = participants
    .filter((p) => p.permissions?.canPublish)
    .map((p) => {
      const m = meta(p);
      return { identity: p.identity, name: m.name, avatarUrl: m.avatarUrl, isSpeaking: speakingIds.has(p.identity) };
    });

  const myHandUp = !!hands?.some((h) => h.user_id === localParticipant.identity);

  const raiseHand = async () => {
    const { error } = await supabase
      .from("briefing_raised_hands")
      .insert({ division_id: divisionId, user_id: localParticipant.identity });
    if (error && !error.message.includes("duplicate")) toast.error(error.message);
  };
  const lowerHand = async (uid?: string) => {
    const id = uid ?? localParticipant.identity;
    const { error } = await supabase
      .from("briefing_raised_hands")
      .delete()
      .eq("division_id", divisionId)
      .eq("user_id", id);
    if (error) toast.error(error.message);
  };

  const handsList = (hands ?? []).map((h) => {
    const p = participants.find((pp) => pp.identity === h.user_id);
    const m = p ? meta(p) : { name: "Kører", avatarUrl: null, isAdmin: false };
    return { userId: h.user_id, name: m.name, avatarUrl: m.avatarUrl, inRoom: !!p };
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Taler nu
        </p>
        {speakers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen har ordet endnu.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {speakers.map((s) => (
              <div
                key={s.identity}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                  s.isSpeaking ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={s.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{s.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{s.name}</span>
                {s.isSpeaking && <Volume2 className="h-3.5 w-3.5 text-primary" />}
                {isAdmin && s.identity !== localParticipant.identity && (
                  <button
                    onClick={async () => {
                      try {
                        await revokeFn({ data: { divisionId, participantIdentity: s.identity } });
                        toast.success("Mikrofon fjernet");
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                    className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Fjern taleret"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isAdmin && (
          <>
            {myHandUp ? (
              <Button variant="outline" onClick={() => lowerHand()} className="gap-1">
                <Hand className="h-4 w-4" /> Tag hånden ned
              </Button>
            ) : (
              <Button onClick={raiseHand} className="gap-1">
                <Hand className="h-4 w-4" /> Ræk hånden op
              </Button>
            )}
          </>
        )}
        {localParticipant.permissions?.canPublish && (
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
          >
            {localParticipant.isMicrophoneEnabled ? (
              <><Mic className="h-4 w-4" /> Mute</>
            ) : (
              <><MicOff className="h-4 w-4" /> Unmute</>
            )}
          </Button>
        )}
      </div>

      {handsList.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hænder oppe ({handsList.length})
          </p>
          <ul className="space-y-1.5">
            {handsList.map((h) => (
              <li key={h.userId} className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={h.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{h.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm">{h.name}</span>
                {!h.inRoom && <Badge variant="outline" className="text-[10px]">Ikke i kanal</Badge>}
                {isAdmin && h.inRoom && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await grantFn({ data: { divisionId, participantIdentity: h.userId } });
                        await lowerHand(h.userId);
                        toast.success("Taleret givet");
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                    className="gap-1"
                  >
                    <Mic className="h-3.5 w-3.5" /> Giv ordet
                  </Button>
                )}
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => lowerHand(h.userId)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          I kanalen ({participants.length})
        </p>
        <ul className="space-y-1">
          {participants.map((p) => {
            const m = meta(p);
            const canSpeak = !!p.permissions?.canPublish;
            return (
              <li key={p.identity} className="flex items-center gap-2 py-1 text-sm">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={m.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{m.name}</span>
                {m.isAdmin && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
                {canSpeak && !m.isAdmin && <Badge variant="outline" className="text-[10px]">Taler</Badge>}
                {isAdmin && p.identity !== localParticipant.identity && (
                  <button
                    onClick={async () => {
                      try {
                        await removeFn({ data: { divisionId, participantIdentity: p.identity } });
                        toast.success("Fjernet fra kanal");
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Fjern fra kanal"
                  >
                    <UserX className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
