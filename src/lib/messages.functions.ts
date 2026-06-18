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

export type GroupSummary = {
  groupId: string;
  name: string;
  memberIds: string[];
  lastBody: string | null;
  lastAt: string | null;
  lastSenderId: string | null;
  unread: number;
};

export type SystemSummary = {
  unread: number;
  lastTitle: string | null;
  lastAt: string | null;
};

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    threads: ThreadSummary[];
    groups: GroupSummary[];
    system: SystemSummary;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;

    // DMs
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
      if (!map.has(other)) {
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

    // Groups I'm a member of
    const { data: myMemberships } = await (supabaseAdmin as any)
      .from("chat_group_members")
      .select("group_id,last_read_at")
      .eq("user_id", me);

    const groupIds = (myMemberships ?? []).map((r: any) => r.group_id) as string[];
    const lastReadByGroup = new Map<string, string>(
      (myMemberships ?? []).map((r: any) => [r.group_id, r.last_read_at]),
    );

    const groups: GroupSummary[] = [];
    if (groupIds.length > 0) {
      const { data: gRows } = await (supabaseAdmin as any)
        .from("chat_groups")
        .select("id,name")
        .in("id", groupIds);
      const { data: allMembers } = await (supabaseAdmin as any)
        .from("chat_group_members")
        .select("group_id,user_id")
        .in("group_id", groupIds);
      const membersByGroup = new Map<string, string[]>();
      for (const m of (allMembers ?? []) as any[]) {
        const list = membersByGroup.get(m.group_id) ?? [];
        list.push(m.user_id);
        membersByGroup.set(m.group_id, list);
      }

      // Last message per group
      const { data: gm } = await (supabaseAdmin as any)
        .from("group_messages")
        .select("group_id,sender_id,body,created_at")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(500);
      const lastByGroup = new Map<string, any>();
      const unreadByGroup = new Map<string, number>();
      for (const m of (gm ?? []) as any[]) {
        if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, m);
        const lr = lastReadByGroup.get(m.group_id);
        if (m.sender_id !== me && lr && new Date(m.created_at) > new Date(lr)) {
          unreadByGroup.set(m.group_id, (unreadByGroup.get(m.group_id) ?? 0) + 1);
        }
      }

      for (const g of (gRows ?? []) as any[]) {
        const last = lastByGroup.get(g.id);
        groups.push({
          groupId: g.id,
          name: g.name,
          memberIds: membersByGroup.get(g.id) ?? [],
          lastBody: last?.body ?? null,
          lastAt: last?.created_at ?? null,
          lastSenderId: last?.sender_id ?? null,
          unread: unreadByGroup.get(g.id) ?? 0,
        });
      }
      groups.sort((a, b) => {
        const av = a.lastAt ? +new Date(a.lastAt) : 0;
        const bv = b.lastAt ? +new Date(b.lastAt) : 0;
        return bv - av;
      });
    }

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

    return { threads, groups, system };
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
      .select("id,display_name,avatar_url,lmu_name")
      .neq("id", context.userId)
      .order("display_name", { ascending: true })
      .limit(20);
    if (q.length > 0) {
      const like = `%${q}%`;
      query = query.or(`display_name.ilike.${like},lmu_name.ilike.${like}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { users: rows ?? [] };
  });

// ============== GROUPS ==============

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().uuid()).min(1).max(50),
});

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createGroupSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;
    const members = Array.from(new Set([me, ...data.memberIds]));

    const { data: g, error } = await (supabaseAdmin as any)
      .from("chat_groups")
      .insert({ name: data.name, created_by: me })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const rows = members.map((uid) => ({ group_id: g.id, user_id: uid }));
    const { error: mErr } = await (supabaseAdmin as any)
      .from("chat_group_members")
      .insert(rows);
    if (mErr) throw new Error(mErr.message);

    return { groupId: g.id as string };
  });

const renameGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export const renameGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => renameGroupSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isMember } = await (supabaseAdmin as any).rpc("is_chat_group_member", {
      _group_id: data.groupId,
      _user_id: context.userId,
    });
    if (!isMember) throw new Error("Du er ikke medlem af denne gruppe.");

    const { error } = await (supabaseAdmin as any)
      .from("chat_groups")
      .update({ name: data.name })
      .eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const groupIdSchema = z.object({ groupId: z.string().uuid() });

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => groupIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;

    const { data: isMember } = await (supabaseAdmin as any).rpc("is_chat_group_member", {
      _group_id: data.groupId,
      _user_id: me,
    });
    if (!isMember) throw new Error("Du er ikke medlem af denne gruppe.");

    const [{ data: group }, { data: memberRows }, { data: messages }] = await Promise.all([
      (supabaseAdmin as any).from("chat_groups").select("id,name,created_by,created_at").eq("id", data.groupId).single(),
      (supabaseAdmin as any).from("chat_group_members").select("user_id,joined_at").eq("group_id", data.groupId),
      (supabaseAdmin as any)
        .from("group_messages")
        .select("id,sender_id,body,created_at")
        .eq("group_id", data.groupId)
        .order("created_at", { ascending: true })
        .limit(500),
    ]);

    const memberIds = (memberRows ?? []).map((m: any) => m.user_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

    // Mark read
    await (supabaseAdmin as any)
      .from("chat_group_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("group_id", data.groupId)
      .eq("user_id", me);

    return {
      group,
      members: (profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>,
      messages: (messages ?? []) as Array<{ id: string; sender_id: string; body: string; created_at: string }>,
    };
  });

const sendGroupSchema = z.object({
  groupId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => sendGroupSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;

    const { data: isMember } = await (supabaseAdmin as any).rpc("is_chat_group_member", {
      _group_id: data.groupId,
      _user_id: me,
    });
    if (!isMember) throw new Error("Du er ikke medlem af denne gruppe.");

    const { data: row, error } = await (supabaseAdmin as any)
      .from("group_messages")
      .insert({ group_id: data.groupId, sender_id: me, body: data.body })
      .select("id,sender_id,body,created_at")
      .single();
    if (error) throw new Error(error.message);

    // Bump my last_read_at so I don't get unread for my own msg
    await (supabaseAdmin as any)
      .from("chat_group_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("group_id", data.groupId)
      .eq("user_id", me);

    // Push to other members
    const [{ data: members }, { data: prof }, { data: g }] = await Promise.all([
      (supabaseAdmin as any).from("chat_group_members").select("user_id").eq("group_id", data.groupId).neq("user_id", me),
      supabaseAdmin.from("profiles").select("display_name").eq("id", me).maybeSingle(),
      (supabaseAdmin as any).from("chat_groups").select("name").eq("id", data.groupId).single(),
    ]);
    const senderName = (prof as any)?.display_name ?? "Ny besked";
    const title = `${(g as any)?.name ?? "Gruppe"}`;
    const { sendPushToUser } = await import("./push.server");
    for (const m of (members ?? []) as any[]) {
      void sendPushToUser(m.user_id, {
        title,
        body: `${senderName}: ${data.body.slice(0, 120)}`,
        url: `/beskeder/gruppe/${data.groupId}`,
        tag: `grp:${data.groupId}`,
      }).catch(() => {});
    }

    return row;
  });

const memberMutSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => memberMutSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isMember } = await (supabaseAdmin as any).rpc("is_chat_group_member", {
      _group_id: data.groupId,
      _user_id: context.userId,
    });
    if (!isMember) throw new Error("Du er ikke medlem af denne gruppe.");
    const { error } = await (supabaseAdmin as any)
      .from("chat_group_members")
      .upsert({ group_id: data.groupId, user_id: data.userId }, { onConflict: "group_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => memberMutSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isMember } = await (supabaseAdmin as any).rpc("is_chat_group_member", {
      _group_id: data.groupId,
      _user_id: context.userId,
    });
    if (!isMember && data.userId !== context.userId) {
      throw new Error("Du er ikke medlem af denne gruppe.");
    }
    const { error } = await (supabaseAdmin as any)
      .from("chat_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => groupIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("chat_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const teamInviteNotifySchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const notifyTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => teamInviteNotifySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify caller is the team owner (or admin)
    const { data: team } = await (supabaseAdmin as any)
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", data.teamId)
      .maybeSingle();
    if (!team) throw new Error("Team findes ikke");

    const { data: isAdmin } = await (context.supabase as any)
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (team.owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan sende invitationer");
    }

    const { error } = await (supabaseAdmin as any).from("notifications").insert({
      user_id: data.userId,
      title: `Du er blevet inviteret til at joine "${team.name}"`,
      body: "Åbn beskeder for at acceptere eller afvise invitationen.",
      link: `/beskeder/system`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
