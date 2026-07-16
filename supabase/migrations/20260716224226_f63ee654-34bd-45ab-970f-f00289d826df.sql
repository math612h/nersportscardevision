CREATE TABLE public.overtaking_discord_posts (
  week_start date PRIMARY KEY,
  clip_id uuid NOT NULL REFERENCES public.overtaking_clips(id) ON DELETE CASCADE,
  posted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.overtaking_discord_posts TO authenticated;
GRANT ALL ON public.overtaking_discord_posts TO service_role;

ALTER TABLE public.overtaking_discord_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view discord post log"
ON public.overtaking_discord_posts
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));