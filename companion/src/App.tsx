import { useEffect, useState } from "react";

declare global {
  interface Window {
    companion: {
      getStatus: () => Promise<Status>;
      signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string; user?: any }>;
      sendOtp: (email: string) => Promise<{ ok: boolean; error?: string }>;
      verifyOtp: (email: string, token: string) => Promise<{ ok: boolean; error?: string; user?: any }>;
      signOut: () => Promise<{ ok: boolean }>;
      scanNow: () => Promise<{ uploaded: number; error?: string }>;
      onStatusUpdate: (cb: (s: Status) => void) => () => void;
    };
  }
}

type Status = {
  signedIn: boolean;
  user: { display_name: string; email: string; lmu_name: string | null; approved: boolean } | null;
  lmu: { lmuFound: boolean; folder: string | null };
  uploadCount: number;
  lastError: string | null;
};

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    window.companion.getStatus().then(setStatus);
    const off = window.companion.onStatusUpdate(setStatus);
    return off;
  }, []);

  if (!status) return <div className="app"><div className="brand"><span className="brand-dot" />NER Sportscar</div><p className="sub">Indlæser…</p></div>;

  return (
    <div className="app">
      <div className="brand">
        <span className="brand-dot" />
        NER Sportscar Companion
      </div>
      {status.signedIn ? <SignedIn status={status} /> : <SignIn />}
      <div className="footer">
        Læs mere på <a href="https://nersportscardevision.lovable.app/leaderboard" onClick={(e) => { e.preventDefault(); window.open("https://nersportscardevision.lovable.app/leaderboard"); }}>nersportscardevision.lovable.app</a>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await window.companion.signIn(email, password);
    setLoading(false);
    if (!r.ok) setError(r.error || "Login fejlede");
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div>
        <h1>Log ind</h1>
        <p className="sub">Brug samme e-mail og adgangskode som på hjemmesiden.</p>
      </div>
      <div>
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <div>
        <label>Adgangskode</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="err" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading}>{loading ? "Logger ind…" : "Log ind"}</button>
      <p className="hint">
        Logger du normalt ind med Google? Brug "Glemt adgangskode" på hjemmesiden for at sætte en adgangskode, og brug den her.
      </p>
    </form>
  );
}

function SignedIn({ status }: { status: Status }) {
  const [scanning, setScanning] = useState(false);
  const scan = async () => {
    setScanning(true);
    await window.companion.scanNow();
    setScanning(false);
  };
  const out = () => window.companion.signOut();

  return (
    <div className="stack">
      <div>
        <h1>Klar</h1>
        <p className="sub">Companion kører i baggrunden og uploader dine tider automatisk.</p>
      </div>

      <div className="card">
        <div className="row"><span className="k">Bruger</span><span className="v">{status.user?.display_name}</span></div>
        <div className="row">
          <span className="k">Status</span>
          <span className={`v ${status.user?.approved ? "ok" : "warn"}`}>
            {status.user?.approved ? "Godkendt" : "Afventer godkendelse"}
          </span>
        </div>
        <div className="row">
          <span className="k">LMU-navn</span>
          <span className={`v ${status.user?.lmu_name ? "" : "warn"}`}>
            {status.user?.lmu_name || "Ikke sat — sæt det på din profil"}
          </span>
        </div>
        <div className="row">
          <span className="k">LMU fundet</span>
          <span className={`v ${status.lmu.lmuFound ? "ok" : "err"}`}>
            {status.lmu.lmuFound ? "Ja" : "Nej — start LMU mindst én gang"}
          </span>
        </div>
        <div className="row"><span className="k">Uploadede tider</span><span className="v">{status.uploadCount}</span></div>
      </div>

      {status.lastError && (
        <p className="err" style={{ fontSize: 12, margin: 0 }}>Sidste fejl: {status.lastError}</p>
      )}

      <button onClick={scan} disabled={scanning || !status.lmu.lmuFound}>
        {scanning ? "Scanner…" : "Scan alle gamle resultater"}
      </button>
      <button className="secondary" onClick={out}>Log ud</button>

      <p className="hint">
        Du kan lukke dette vindue — appen kører videre i system tray (nede ved siden af uret). Højreklik på ikonet for menu.
      </p>
    </div>
  );
}
