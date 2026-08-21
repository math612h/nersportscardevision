CREATE TABLE public.streaming_profile_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  help_text text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streaming_profile_questions TO authenticated;
GRANT ALL ON public.streaming_profile_questions TO service_role;
ALTER TABLE public.streaming_profile_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions readable by authenticated" ON public.streaming_profile_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage questions insert" ON public.streaming_profile_questions FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "admins manage questions update" ON public.streaming_profile_questions FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "admins manage questions delete" ON public.streaming_profile_questions FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.streaming_profile_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.streaming_profile_questions(id) on delete cascade,
  answer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streaming_profile_answers TO authenticated;
GRANT ALL ON public.streaming_profile_answers TO service_role;
ALTER TABLE public.streaming_profile_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own answers select" ON public.streaming_profile_answers FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "own answers insert" ON public.streaming_profile_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own answers update" ON public.streaming_profile_answers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own answers delete" ON public.streaming_profile_answers FOR DELETE TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER streaming_profile_questions_touch BEFORE UPDATE ON public.streaming_profile_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER streaming_profile_answers_touch BEFORE UPDATE ON public.streaming_profile_answers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.streaming_profile_questions (question_text, help_text, position) VALUES
 ('Hvad er dit kaldenavn på streamen?', 'Sådan vil kommentatorerne omtale dig', 1),
 ('Hvor kommer du fra?', 'By/landsdel', 2),
 ('Hvor længe har du sim-racet?', null, 3),
 ('Sjov fakta om dig selv', 'Noget kommentatorerne kan nævne live', 4),
 ('Dit mål for sæsonen', null, 5);