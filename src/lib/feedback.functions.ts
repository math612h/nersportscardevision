import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export type FeedbackItem = {
  id: string;
  user_id: string | null;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  author?: { display_name: string | null; avatar_url: string | null; email: string | null } | null;
};

export type SurveyQuestionType = "single_choice" | "multi_choice" | "text";

export type SurveyQuestion = {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: SurveyQuestionType;
  options: string[];
  position: number;
  required: boolean;
};

export type Survey = {
  id: string;
  title: string;
  description: string | null;
  is_anonymous: boolean;
  is_active: boolean;
  created_at: string;
  questions: SurveyQuestion[];
};

// ============ FEEDBACK ============

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) => {
    const msg = (d?.message ?? "").trim();
    if (!msg) throw new Error("Feedback må ikke være tom");
    if (msg.length > 5000) throw new Error("Feedback er for lang (max 5000 tegn)");
    return { message: msg };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("feedback")
      .insert({ user_id: context.userId, message: data.message, status: "new" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("feedback")
      .select("id, message, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedbackItem[]> => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("feedback")
      .select("id, user_id, message, status, admin_notes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const authors: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      for (const p of (profs ?? []) as any[]) authors[p.id] = p;
    }
    return rows.map((r) => ({
      ...r,
      author: r.user_id
        ? {
            display_name: authors[r.user_id]?.display_name ?? null,
            avatar_url: authors[r.user_id]?.avatar_url ?? null,
            email: authors[r.user_id]?.email ?? null,
          }
        : null,
    }));
  });

export const updateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status?: string; admin_notes?: string | null }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const patch: Record<string, unknown> = {};
    if (typeof data.status === "string") patch.status = data.status;
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("feedback").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase.from("feedback").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ SURVEYS ============

async function loadSurveyWithQuestions(supabase: any, surveyId: string): Promise<Survey | null> {
  const { data: s } = await supabase
    .from("surveys")
    .select("id, title, description, is_anonymous, is_active, created_at")
    .eq("id", surveyId)
    .maybeSingle();
  if (!s) return null;
  const { data: qs } = await supabase
    .from("survey_questions")
    .select("id, survey_id, question_text, question_type, options, position, required")
    .eq("survey_id", surveyId)
    .order("position", { ascending: true });
  return {
    ...s,
    questions: ((qs ?? []) as any[]).map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : [],
    })),
  } as Survey;
}

export const listActiveSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ survey: Survey; answered: boolean }[]> => {
    const { data: surveys } = await context.supabase
      .from("surveys")
      .select("id, title, description, is_anonymous, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    const results: { survey: Survey; answered: boolean }[] = [];
    for (const s of (surveys ?? []) as any[]) {
      const survey = await loadSurveyWithQuestions(context.supabase, s.id);
      if (!survey) continue;
      const { data: mine } = await context.supabase
        .from("survey_responses")
        .select("id")
        .eq("survey_id", s.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      results.push({ survey, answered: !!mine });
    }
    return results;
  });

export const listAllSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data: surveys } = await context.supabase
      .from("surveys")
      .select("id, title, description, is_anonymous, is_active, created_at")
      .order("created_at", { ascending: false });
    const rows: (Survey & { response_count: number })[] = [];
    for (const s of (surveys ?? []) as any[]) {
      const survey = await loadSurveyWithQuestions(context.supabase, s.id);
      if (!survey) continue;
      const { count } = await context.supabase
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("survey_id", s.id);
      rows.push({ ...survey, response_count: count ?? 0 });
    }
    return rows;
  });

export const createSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      title: string;
      description?: string | null;
      is_anonymous?: boolean;
      is_active?: boolean;
      questions: {
        question_text: string;
        question_type: SurveyQuestionType;
        options: string[];
        required?: boolean;
      }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const title = (data.title ?? "").trim();
    if (!title) throw new Error("Titel er påkrævet");
    if (!Array.isArray(data.questions) || data.questions.length === 0)
      throw new Error("Tilføj mindst ét spørgsmål");
    const { data: survey, error } = await context.supabase
      .from("surveys")
      .insert({
        title,
        description: data.description ?? null,
        is_anonymous: !!data.is_anonymous,
        is_active: data.is_active ?? true,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !survey) throw new Error(error?.message ?? "Kunne ikke oprette undersøgelse");
    const rows = data.questions.map((q, idx) => ({
      survey_id: survey.id,
      question_text: q.question_text.trim(),
      question_type: q.question_type,
      options: q.question_type === "text" ? [] : (q.options ?? []).map((o) => String(o)),
      position: idx,
      required: !!q.required,
    }));
    const { error: qErr } = await context.supabase.from("survey_questions").insert(rows);
    if (qErr) throw new Error(qErr.message);
    return { id: survey.id };
  });

export const updateSurveyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("surveys")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase.from("surveys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitSurveyResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      survey_id: string;
      answers: { question_id: string; choice_values?: string[]; text_value?: string | null }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { data: survey } = await context.supabase
      .from("surveys")
      .select("id, is_anonymous, is_active")
      .eq("id", data.survey_id)
      .maybeSingle();
    if (!survey) throw new Error("Undersøgelsen findes ikke");
    if (!survey.is_active) throw new Error("Undersøgelsen er lukket");

    // Prevent duplicate for non-anonymous
    if (!survey.is_anonymous) {
      const { data: existing } = await context.supabase
        .from("survey_responses")
        .select("id")
        .eq("survey_id", data.survey_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (existing) throw new Error("Du har allerede svaret på denne undersøgelse");
    }

    const { data: resp, error: rErr } = await context.supabase
      .from("survey_responses")
      .insert({
        survey_id: data.survey_id,
        user_id: survey.is_anonymous ? null : context.userId,
      })
      .select("id")
      .single();
    if (rErr || !resp) throw new Error(rErr?.message ?? "Kunne ikke gemme besvarelse");

    const answers = (data.answers ?? []).map((a) => ({
      response_id: resp.id,
      question_id: a.question_id,
      choice_values: Array.isArray(a.choice_values) ? a.choice_values.map(String) : [],
      text_value: a.text_value ?? null,
    }));
    if (answers.length > 0) {
      const { error: aErr } = await context.supabase.from("survey_answers").insert(answers);
      if (aErr) throw new Error(aErr.message);
    }
    return { ok: true };
  });

export type SurveyResults = {
  survey: Survey;
  response_count: number;
  is_anonymous: boolean;
  questions: {
    id: string;
    question_text: string;
    question_type: SurveyQuestionType;
    options: string[];
    choice_counts: Record<string, number>;
    text_answers: {
      value: string;
      created_at: string;
      user?: { id: string; display_name: string | null } | null;
    }[];
    total_answers: number;
  }[];
};

export const getSurveyResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<SurveyResults> => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const survey = await loadSurveyWithQuestions(context.supabase, data.id);
    if (!survey) throw new Error("Not found");

    const { data: responses } = await context.supabase
      .from("survey_responses")
      .select("id, user_id, created_at")
      .eq("survey_id", data.id);
    const responseIds = (responses ?? []).map((r: any) => r.id);

    let answers: any[] = [];
    if (responseIds.length > 0) {
      const { data: rows } = await context.supabase
        .from("survey_answers")
        .select("response_id, question_id, choice_values, text_value, created_at")
        .in("response_id", responseIds);
      answers = rows ?? [];
    }

    const responseMap = new Map<string, any>();
    for (const r of responses ?? []) responseMap.set(r.id, r);

    // Load display names only if not anonymous
    let names: Record<string, string> = {};
    if (!survey.is_anonymous) {
      const userIds = Array.from(
        new Set((responses ?? []).map((r: any) => r.user_id).filter(Boolean)),
      );
      if (userIds.length > 0) {
        const { data: profs } = await context.supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        for (const p of profs ?? []) names[p.id] = p.display_name ?? "";
      }
    }

    const questions = survey.questions.map((q) => {
      const rowsForQ = answers.filter((a) => a.question_id === q.id);
      const choice_counts: Record<string, number> = {};
      for (const opt of q.options) choice_counts[opt] = 0;
      const text_answers: {
        value: string;
        created_at: string;
        user?: { id: string; display_name: string | null } | null;
      }[] = [];
      for (const a of rowsForQ) {
        if (q.question_type === "text") {
          if (a.text_value) {
            const resp = responseMap.get(a.response_id);
            const uid = resp?.user_id ?? null;
            text_answers.push({
              value: String(a.text_value),
              created_at: a.created_at ?? resp?.created_at ?? "",
              user:
                survey.is_anonymous || !uid
                  ? null
                  : { id: uid, display_name: names[uid] ?? null },
            });
          }
        } else {
          for (const v of a.choice_values ?? []) {
            const key = String(v);
            choice_counts[key] = (choice_counts[key] ?? 0) + 1;
          }
        }
      }
      return {
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        choice_counts,
        text_answers,
        total_answers: rowsForQ.length,
      };
    });

    return {
      survey,
      response_count: (responses ?? []).length,
      is_anonymous: survey.is_anonymous,
      questions,
    };
  });
