import { createFileRoute } from "@tanstack/react-router";

// Peger på den rullende "companion-latest" GitHub Release som bygges automatisk
// af .github/workflows/build-companion.yml. NSIS-installeren indeholder alle
// production node_modules (inkl. @supabase/supabase-js), i modsætning til den
// tidligere uploadede ZIP-asset som manglede dependencies og fejlede med
// "Cannot find module '@supabase/supabase-js'" ved opstart.
const INSTALLER_URL =
  "https://github.com/math612h/nersportscardevision/releases/download/companion-latest/LMU-Danmark-Tracker-Setup.exe";

export const Route = createFileRoute("/api/public/download/companion")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: INSTALLER_URL,
          },
        });
      },
    },
  },
});
