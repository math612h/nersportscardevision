
-- ============ FEEDBACK ============
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created_at_idx ON public.feedback (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback" ON public.feedback
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own feedback" ON public.feedback
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback" ON public.feedback
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update feedback" ON public.feedback
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete feedback" ON public.feedback
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ SURVEYS ============
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_anonymous boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX surveys_active_idx ON public.surveys (is_active, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active surveys" ON public.surveys
FOR SELECT TO authenticated
USING (is_active OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage surveys" ON public.surveys
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ SURVEY QUESTIONS ============
CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single_choice','multi_choice','text')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_questions_survey_idx ON public.survey_questions (survey_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;
GRANT ALL ON public.survey_questions TO service_role;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view questions on visible surveys" ON public.survey_questions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND (s.is_active OR private.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "Admins manage questions" ON public.survey_questions
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ SURVEY RESPONSES ============
CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_responses_survey_idx ON public.survey_responses (survey_id, created_at DESC);
CREATE UNIQUE INDEX survey_responses_survey_user_unique
  ON public.survey_responses (survey_id, user_id)
  WHERE user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- We insert responses via server functions with the caller's authenticated
-- Supabase client (RLS applies). Only allow inserts that either identify the
-- user OR belong to an anonymous survey.
CREATE POLICY "Users insert own or anonymous responses" ON public.survey_responses
FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid())
  OR (
    user_id IS NULL
    AND EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = survey_id AND s.is_anonymous)
  )
);

CREATE POLICY "Users view own responses" ON public.survey_responses
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view all responses" ON public.survey_responses
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete responses" ON public.survey_responses
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ SURVEY ANSWERS ============
CREATE TABLE public.survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  choice_values text[] NOT NULL DEFAULT '{}',
  text_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_answers_response_idx ON public.survey_answers (response_id);
CREATE INDEX survey_answers_question_idx ON public.survey_answers (question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_answers TO authenticated;
GRANT ALL ON public.survey_answers TO service_role;
ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert answers on their responses" ON public.survey_answers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.survey_responses r
    WHERE r.id = response_id
      AND (
        r.user_id = auth.uid()
        OR (
          r.user_id IS NULL
          AND EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = r.survey_id AND s.is_anonymous)
        )
      )
  )
);

CREATE POLICY "Users view answers on their own responses" ON public.survey_answers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.survey_responses r
    WHERE r.id = response_id AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Admins view all answers" ON public.survey_answers
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at_ts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_set_updated_at
BEFORE UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

CREATE TRIGGER surveys_set_updated_at
BEFORE UPDATE ON public.surveys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();
