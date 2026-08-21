import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export const Route = createFileRoute("/api/public/broadcast/streaming-profiles")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const leagueMatch = url.searchParams.get("league");
          const driverParam = url.searchParams.get("driverId");

          const { data: questions, error: qErr } = await supabaseAdmin
            .from("streaming_profile_questions" as any)
            .select("id, question_text, position, active")
            .eq("active", true)
            .order("position", { ascending: true });
          if (qErr) throw qErr;

          // Optional scoping: only drivers entered in a given league.
          let userFilter: string[] | null = null;
          if (leagueMatch) {
            const { data: league } = await supabaseAdmin
              .from("leagues")
              .select("id")
              .ilike("name", `%${leagueMatch}%`)
              .eq("published", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!league) {
              return Response.json({ error: "Liga ikke fundet" }, { status: 404, headers: CORS });
            }
            const { data: entries } = await supabaseAdmin
              .from("entries")
              .select("user_id")
              .eq("league_id", league.id);
            userFilter = [...new Set((entries ?? []).map((e: any) => e.user_id))];
          }
          if (driverParam) {
            const ids = driverParam.split(",").map((s) => s.trim()).filter(Boolean);
            userFilter = userFilter ? userFilter.filter((id) => ids.includes(id)) : ids;
          }

          let answerQuery = supabaseAdmin
            .from("streaming_profile_answers" as any)
            .select("user_id, question_id, answer, updated_at");
          if (userFilter) {
            if (!userFilter.length) {
              return Response.json({ questions: questions ?? [], drivers: [] }, { status: 200, headers: CORS });
            }
            answerQuery = answerQuery.in("user_id", userFilter);
          }
          const { data: answers, error: aErr } = await answerQuery;
          if (aErr) throw aErr;

          const rows = (answers ?? []).filter((a: any) => (a.answer ?? "").trim());
          const userIds = [...new Set(rows.map((a: any) => a.user_id as string))];

          const { data: profiles } = userIds.length
            ? await supabaseAdmin
                .from("profiles")
                .select("id, display_name, lmu_name")
                .in("id", userIds)
            : { data: [] as any[] };

          const questionText = new Map<string, string>();
          for (const q of (questions ?? []) as any[]) questionText.set(q.id, q.question_text);

          const drivers = (profiles ?? []).map((p: any) => ({
            driverId: p.id,
            driverName: p.display_name || p.lmu_name || "",
            answers: rows
              .filter((a: any) => a.user_id === p.id && questionText.has(a.question_id))
              .map((a: any) => ({
                questionId: a.question_id,
                question: questionText.get(a.question_id)!,
                answer: a.answer,
                updatedAt: a.updated_at,
              })),
          }));

          return Response.json(
            {
              questions: ((questions ?? []) as any[]).map((q) => ({
                id: q.id,
                question: q.question_text,
                position: q.position,
              })),
              drivers,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[broadcast/streaming-profiles]", e);
          return Response.json({ error: "Serverfejl" }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
