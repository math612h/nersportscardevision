import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, BellRing, BellOff } from "lucide-react";
import { getThread, sendMessage } from "@/lib/messages.functions";
import {
  enablePushNotifications,
  disablePushNotifications,
  hasActivePushSubscription,
  currentPermission,
  isPushSupported,
} from "@/lib/push-client";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/beskeder/$threadId")({
  component: ThreadView,
});

function ThreadView() {
  const { threadId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pushOn, setPushOn] = useState<boolean>(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["msg-thread", threadId],
    queryFn: () => getThread({ data: { otherUserId: threadId } }),
  });

  // Realtime new messages for this thread
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`dm-thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as { sender_id: string; recipient_id: string };
          const involvesPair =
            (row.sender_id === user.id && row.recipient_id === threadId) ||
            (row.sender_id === threadId && row.recipient_id === user.id);
          if (involvesPair) {
            void refetch();
            qc.invalidateQueries({ queryKey: ["msg-threads"] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, threadId, refetch, qc]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  // Focus textarea
  useEffect(() => {
    taRef.current?.focus();
  }, [threadId]);

  // Check push subscription state on mount
  useEffect(() => {
    void hasActivePushSubscription().then(setPushOn);
  }, []);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage({ data: { recipientId: threadId, body } });
      setText("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["msg-threads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke sende beskeden");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const togglePush = async () => {
    if (pushOn) {
      await disablePushNotifications();
      setPushOn(false);
      toast.success("Push-notifikationer slået fra");
    } else {
      const res = await enablePushNotifications();
      if (res.ok) {
        setPushOn(true);
        toast.success("Push-notifikationer aktiveret");
      } else if (res.reason === "denied") {
        toast.error("Du har blokeret notifikationer. Tillad dem i browserens indstillinger.");
      } else if (res.reason === "unsupported") {
        toast.error("Din browser understøtter ikke push-notifikationer.");
      } else if (res.reason === "no_vapid_key") {
        toast.error("Push er ikke konfigureret på serveren endnu.");
      } else {
        toast.error("Kunne ikke aktivere notifikationer.");
      }
    }
  };

  const other = data?.other;
  const messages = data?.messages ?? [];
  const permission = currentPermission();
  const showPushPrompt = isPushSupported() && permission === "default" && !pushOn;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-background/60 p-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => navigate({ to: "/beskeder" })}
          aria-label="Tilbage"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <UserAvatarOnly userId={threadId} fallbackName={other?.display_name ?? "?"} size="md" />
        <div className="min-w-0 flex-1">
          <Link
            to="/profil/$userId"
            params={{ userId: threadId }}
            className="block truncate text-sm font-semibold hover:underline"
          >
            {other?.display_name ?? "Ukendt bruger"}
          </Link>
        </div>
        {isPushSupported() && permission !== "denied" && (
          <Button variant="ghost" size="icon" onClick={togglePush} title={pushOn ? "Sluk push" : "Aktivér push"}>
            {pushOn ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {showPushPrompt && (
        <div className="border-b border-border bg-primary/5 px-3 py-2 text-xs">
          Vil du have besked på din telefon når du får nye beskeder?{" "}
          <button onClick={togglePush} className="font-medium text-primary underline">
            Aktivér notifikationer
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-center text-xs text-muted-foreground">Indlæser…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            Ingen beskeder endnu. Skriv den første!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn("mt-1 text-[10px] opacity-70", mine ? "text-right" : "")}>
                      {format(new Date(m.created_at), "HH:mm")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/60 p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Skriv en besked…"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button onClick={handleSend} disabled={!text.trim() || sending} size="icon" aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
