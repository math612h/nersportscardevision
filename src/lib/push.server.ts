// Server-only helper for sending Web Push notifications via VAPID.
// Never import from client-reachable modules at module scope.
import webpush from "web-push";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@lmudanmark.dk";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!configure()) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await (supabaseAdmin as any)
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/beskeder",
    tag: payload.tag,
  });

  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
        else console.error("[push] send failed", status, err?.body ?? err?.message);
      }
    }),
  );

  if (stale.length > 0) {
    await (supabaseAdmin as any).from("push_subscriptions").delete().in("id", stale);
  }
}

/** Insert a notification row AND deliver a web-push to the user. */
export async function notifyUser(
  userId: string,
  args: { title: string; body?: string | null; link?: string | null; tag?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
  });
  if (error) throw new Error(error.message);
  // Fire-and-forget push
  void sendPushToUser(userId, {
    title: args.title,
    body: args.body ?? "",
    url: args.link ?? "/beskeder",
    tag: args.tag,
  }).catch(() => {});
}
