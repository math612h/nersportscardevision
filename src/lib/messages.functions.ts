import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ThreadSummary = {
  otherUserId: string;
  otherName: string;
  otherAvatar: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
  lastSenderId: string;
};

export type SystemSummary = {
  unread: number;
  lastTitle: string | null;
  lastAt: string | null;
};

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ threads: ThreadSummary[]; system: SystemSummary }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;

    // All DMs that involve me, newest first
    const { data: msgs, error } = await (supabaseAdmin as any)
      .from("direct_messages")
      .select("sender_id,recipient_id,body,created_at,read_at")
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const map = new Map<string, ThreadSummary>();
    for (const m of (msgs ?? []) as any[]) {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      const existing = map.get(other);
      if (!existing) {
        map.set(other, {
          otherUserId: other,
          otherName: "",
          otherAvatar: null,
          lastBody: m.body,
          lastAt: m.created_at,
          unread: 0,
          lastSenderId: m.sender_id,
        });
      }
      const t = map.get(other)!;
      if (m.recipient_id === me && !m.read_at) t.unread += 1;
    }

    const ids = Array.from(map.keys());
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", ids);
      for (const p of (profs ?? []) as any[]) {
        const t = map.get(p.id);
        if (t) {
          t.otherName = p.display_name ?? "Ukendt bruger";
          t.otherAvatar = p.avatar_url ?? null;
        }
      }
    }

    const threads = Array.from(map.values()).sort(
      (a, b) => +new Date(b.lastAt) - +new Date(a.lastAt),
    );

    // System notifications summary
    const { data: notif } = await supabaseAdmin
      .from("notifications")
      .select("title,created_at,read_at")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(50);
    const sysUnread = (notif ?? []).filter((n: any) => !n.read_at).length;
    const system: SystemSummary = {
      unread: sysUnread,
      lastTitle: (notif?.[0] as any)?.title ?? null,
      lastAt: (notif?.[0] as any)?.created_at ?? null,
    };

    return { threads, system };
  });

const getThreadSchema = z.object({ otherUserId: z.string().uuid() });

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => getThreadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;
    const other = data.otherUserId;

    const { data: messages, error } = await (supabaseAdmin as any)
      .from("direct_messages")
      .select("id,sender_id,recipient_id,body,created_at,read_at")
      .or(
        `and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`,
      )
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    // Mark unread incoming as read
    await (supabaseAdmin as any)
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", other)
      .eq("recipient_id", me)
      .is("read_at", null);

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,avatar_url")
      .eq("id", other)
      .maybeSingle();

    return {
      messages: (messages ?? []) as Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        body: string;
        created_at: string;
        read_at: string | null;
      }>,
      other: prof ?? { id: other, display_name: "Ukendt bruger", avatar_url: null },
    };
  });

const sendSchema = z.object({
  recipientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.recipientId === context.userId) throw new Error("Du kan ikke sende beskeder til dig selv.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await (supabaseAdmin as any)
      .from("direct_messages")
      .insert({
        sender_id: context.userId,
        recipient_id: data.recipientId,
        body: data.body,
      })
      .select("id,sender_id,recipient_id,body,created_at,read_at")
      .single();
    if (error) throw new Error(error.message);

    // Sender display name for push
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    const senderName = (me as any)?.display_name ?? "Ny besked";

    const { sendPushToUser } = await import("./push.server");
    void sendPushToUser(data.recipientId, {
      title: senderName,
      body: data.body.slice(0, 140),
      url: `/beskeder/${context.userId}`,
      tag: `dm:${context.userId}`,
    }).catch(() => {});

    return row as {
      id: string;
      sender_id: string;
      recipient_id: string;
      body: string;
      created_at: string;
      read_at: string | null;
    };
  });

const markSysSchema = z.object({}).optional();

export const markSystemRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

export const getSystemNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id,title,body,link,created_at,read_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const searchSchema = z.object({ q: z.string().trim().max(80) });

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => searchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q;
    let query = supabaseAdmin
      .from("profiles")
      .select("id,display_name,avatar_url")
      .neq("id", context.userId)
      .order("display_name", { ascending: true })
      .limit(20);
    if (q.length > 0) {
      query = query.ilike("display_name", `%${q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { users: rows ?? [] };
  });
