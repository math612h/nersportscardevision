REVOKE ALL ON FUNCTION public.compute_user_class_score(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_user_class_rating(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_all_user_class_ratings(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_class_ratings_after_leaderboard_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_class_ratings_after_leaderboard_delete() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.compute_user_class_score(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_user_class_rating(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_user_class_ratings(TEXT) TO service_role;