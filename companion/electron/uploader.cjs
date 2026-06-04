// Uploads parsed LMU race results to the Supabase leaderboard.
// Mirrors the logic in src/routes/leaderboard.tsx so the same rules apply.
const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = require("./config.cjs");
const { normalizeCarClass, nameSimilarity } = require("./lmu-parser.cjs");

function makeClient(session) {
  const ws = require("ws");
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: false, // we persist via auth-store ourselves
      detectSessionInUrl: false,
    },
    realtime: {
      transport: ws,
    },
  });
  if (session) {
    client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }
  return client;
}

async function signInWithPassword(email, password) {
  const client = makeClient(null);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function sendEmailOtp(email) {
  const client = makeClient(null);
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return true;
}

async function verifyEmailOtp(email, token) {
  const client = makeClient(null);
  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return data.session;
}

async function restoreSession(session) {
  const client = makeClient(null);
  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  return data.session;
}

async function getUserProfile(session) {
  const client = makeClient(session);
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("No user");
  const { data: profile, error } = await client
    .from("profiles")
    .select("id, lmu_name, approved, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return { user, profile };
}

async function uploadParsedResults({ session, parsed }) {
  const client = makeClient(session);
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const [{ data: profile, error: pErr }, { data: allProfiles, error: aErr }] = await Promise.all([
    client.from("profiles").select("lmu_name, approved").eq("id", user.id).maybeSingle(),
    client.from("profiles").select("id, lmu_name").not("lmu_name", "is", null),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;
  if (!profile?.approved) {
    return { uploaded: 0, skipped: 0, reason: "not_approved" };
  }
  const lmu = (profile.lmu_name || "").trim().toLowerCase();
  if (!lmu) return { uploaded: 0, skipped: 0, reason: "missing_lmu_name" };

  // Uploader must be in the file (fuzzy ≥85%)
  let me = parsed.drivers.find((d) => d.name.trim().toLowerCase() === lmu);
  if (!me) {
    let best = 0;
    for (const d of parsed.drivers) {
      const s = nameSimilarity(d.name, lmu);
      if (s > best) { best = s; if (s >= 0.85) me = d; }
    }
  }
  if (!me) return { uploaded: 0, skipped: parsed.drivers.length, reason: "uploader_not_in_file" };

  const profiles = allProfiles || [];
  const rows = parsed.drivers
    .filter((d) => d.bestLapMs != null)
    .map((d) => {
      const dn = d.name.trim().toLowerCase();
      const exact = profiles.find((p) => (p.lmu_name || "").trim().toLowerCase() === dn);
      let matchId = exact ? exact.id : null;
      if (!matchId) {
        let best = 0;
        for (const p of profiles) {
          const s = nameSimilarity(d.name, p.lmu_name || "");
          if (s >= 0.85 && s > best) { best = s; matchId = p.id; }
        }
      }
      if (!matchId) return null;
      return {
        user_id: matchId,
        driver_name: d.name,
        track: parsed.track,
        layout: parsed.layout,
        car_class: normalizeCarClass(d.carClass),
        car_model: d.carModel,
        best_lap_ms: d.bestLapMs,
        source: "user",
        uploaded_by: user.id,
        recorded_at: parsed.recordedAt,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return { uploaded: 0, skipped: parsed.drivers.length, reason: "no_matched_drivers" };

  const { error } = await client.from("leaderboard_times").insert(rows);
  if (error) throw error;
  return { uploaded: rows.length, skipped: parsed.drivers.length - rows.length };
}

module.exports = { makeClient, signInWithPassword, restoreSession, getUserProfile, uploadParsedResults };
