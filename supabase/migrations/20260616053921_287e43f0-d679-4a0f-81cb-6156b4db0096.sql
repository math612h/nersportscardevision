
-- Restrict anon column access to leagues (exclude created_by)
REVOKE SELECT ON public.leagues FROM anon;
GRANT SELECT (id, name, description, banner_url, created_at, car_class, driver_category, class_configs, is_offseason, event_settings, points_system, signup_opens_at, approved_only, briefing_required, signup_open_notified_at, separate_division_standings, discord_role_id, published, discord_signup_open_notified_at, protest_tickets_per_season, sort_order) ON public.leagues TO anon;

-- Restrict anon column access to teams (exclude owner_id)
REVOKE SELECT ON public.teams FROM anon;
GRANT SELECT (id, name, bio, logo_url, created_at, updated_at) ON public.teams TO anon;

-- Ensure entries and user_league_ratings are not exposed to anon
REVOKE ALL ON public.entries FROM anon;
REVOKE ALL ON public.user_league_ratings FROM anon;

-- Add explicit INSERT/DELETE policies for division_reserve_offers (admin only; service role bypasses RLS)
CREATE POLICY "Admins insert reserve offers"
ON public.division_reserve_offers FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete reserve offers"
ON public.division_reserve_offers FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));
