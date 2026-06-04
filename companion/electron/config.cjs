// Public Supabase config — these are PUBLISHABLE keys, safe in client code.
// RLS policies on the server gate all actual access.
module.exports = {
  SUPABASE_URL: "https://xhypxvolruhlxbapbkgt.supabase.co",
  SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoeXB4dm9scnVobHhiYXBia2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjM1MzcsImV4cCI6MjA5NTg5OTUzN30.L0LBz1Ey-yawvfkxO_v_vmqbAkVn5hcdfL47kQuJ6vo",
  // How often to scan LMU results folder for new files (ms)
  POLL_INTERVAL_MS: 10_000,
};
