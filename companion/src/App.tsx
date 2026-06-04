import { useEffect, useState } from "react";

declare global {
  interface Window {
    companion: {
      getStatus: () => Promise<Status>;
      signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string; user?: any }>;
      sendOtp: (email: string) => Promise<{ ok: boolean; error?: string }>;
      verifyOtp: (email: string, token: string) => Promise<{ ok: boolean; error?: string; user?: any }>;
      signInWithToken: (token: string) => Promise<{ ok: boolean; error?: string; user?: any }>;
      signOut: () => Promise<{ ok: boolean }>;
      scanNow: () => Promise<{ uploaded: number; error?: string }>;
      pickFolder: () => Promise<{ ok: boolean; folder?: string }>;
      clearFolder: () => Promise<{ ok: boolean }>;
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
  customFolder?: string | null;
};

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    window.companion.getStatus().then(setStatus);
    const off = window.companion.onStatusUpdate(setStatus);
    return off;
  }, []);

  if (!status) return <div className="app"><div className="brand"><span className="brand-dot" />DanishEnduranceSeries.dk</div><p className="sub">Indlæser…</p></div>;

  return (
    <div className="app">
      <div className="brand">
        <span className="brand-dot" />
        DanishEnduranceSeries.dk Companion
      </div>
      {status.signedIn ? <SignedIn status={status} /> : <SignIn />}
      <div className="footer">
        Læs mere på <a href="https://danishenduranceseries.dk/leaderboard" onClick={(e) => { e.preventDefault(); window.open("https://danishenduranceseries.dk/leaderboard"); }}>danishenduranceseries.dk</a>
      </div>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"key" | "otp" | "password">("key");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [keyToken, setKeyToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await window.companion.signIn(email, password);
    setLoading(false);
    if (!r.ok) setError(r.error || "Login fejlede");
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    const r = await window.companion.sendOtp(email);
    setLoading(false);
    if (!r.ok) setError(r.error || "Kunne ikke sende kode");
    else { setOtpSent(true); setInfo("Kode sendt — tjek din mail (også spam)."); }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = await window.companion.verifyOtp(email, code.trim());
    setLoading(false);
    if (!r.ok) setError(r.error || "Forkert eller udløbet kode");
  };

  const submitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = await window.companion.signInWithToken(keyToken.trim());
    setLoading(false);
    if (!r.ok) setError(r.error || "Kunne ikke logge ind med nøglen");
  };

  return (
    <div className="stack">
      <div>
        <h1>Log ind</h1>
        <p className="sub">Samme bruger som på hjemmesiden.</p>
      </div>

      <div className="tabs">
        <button type="button" className={mode === "key" ? "tab active" : "tab"} onClick={() => { setMode("key"); setError(null); }}>
          Nøgle
        </button>
        <button type="button" className={mode === "otp" ? "tab active" : "tab"} onClick={() => { setMode("otp"); setError(null); }}>
          Mail-kode
        </button>
        <button type="button" className={mode === "password" ? "tab active" : "tab"} onClick={() => { setMode("password"); setError(null); }}>
          Adgangskode
        </button>
      </div>

      {mode === "key" ? (
        <form className="stack" onSubmit={submitKey}>
          <div>
            <label>Adgangsnøgle fra hjemmesiden</label>
            <input
              type="text"
              value={keyToken}
              onChange={(e) => setKeyToken(e.target.value)}
              required
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="64 tegn — paste her"
              style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 }}
            />
          </div>
          {error && <p className="err" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading || !keyToken.trim()}>
            {loading ? "Logger ind…" : "Log ind"}
          </button>
          <p className="hint">
            Gå ind på din profil på hjemmesiden → <b>Desktop companion</b> → <b>Ny nøgle</b>, og kopiér koden ind her.
            Nøglen virker uden mail eller adgangskode.
          </p>
        </form>
      ) : mode === "password" ? (
        <form className="stack" onSubmit={submitPassword}>
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
        </form>
      ) : !otpSent ? (
        <form className="stack" onSubmit={sendCode}>
          <div>
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          {error && <p className="err" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Sender…" : "Send mig en kode"}</button>
          <p className="hint">Vi sender en 6-cifret kode til din mail. Ingen adgangskode nødvendig.</p>
        </form>
      ) : (
        <form className="stack" onSubmit={verifyCode}>
          <div>
            <label>Kode fra mailen</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus placeholder="123456" />
          </div>
          {info && <p className="hint" style={{ margin: 0 }}>{info}</p>}
          {error && <p className="err" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Tjekker…" : "Log ind"}</button>
          <button type="button" className="secondary" onClick={() => { setOtpSent(false); setCode(""); setInfo(null); setError(null); }}>
            Brug en anden mail
          </button>
        </form>
      )}
    </div>
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
            {status.lmu.lmuFound ? "Ja" : "Nej — vælg mappe manuelt"}
          </span>
        </div>
        {status.lmu.folder && (
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="k">Mappe</span>
            <span className="v" style={{ fontSize: 10, wordBreak: "break-all", textAlign: "right", maxWidth: "70%" }}>
              {status.lmu.folder}
            </span>
          </div>
        )}
        <div className="row"><span className="k">Uploadede tider</span><span className="v">{status.uploadCount}</span></div>
      </div>

      {status.lastError && (
        <p className="err" style={{ fontSize: 12, margin: 0 }}>Sidste fejl: {status.lastError}</p>
      )}

      <button className="secondary" onClick={async () => { await window.companion.pickFolder(); }}>
        {status.customFolder || !status.lmu.lmuFound ? "Vælg LMU Results-mappe…" : "Skift LMU-mappe…"}
      </button>
      {status.customFolder && (
        <button className="secondary" onClick={() => window.companion.clearFolder()}>
          Brug automatisk fundet mappe
        </button>
      )}

      <button onClick={scan} disabled={scanning || !status.lmu.lmuFound}>
        {scanning ? "Scanner…" : "Scan alle gamle resultater"}
      </button>
      <button className="secondary" onClick={out}>Log ud</button>

      <p className="hint" style={{ marginTop: 4 }}>
        Tip: typisk sti er <code>Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results</code>.
      </p>

      <p className="hint">
        Du kan lukke dette vindue — appen kører videre i system tray (nede ved siden af uret). Højreklik på ikonet for menu.
      </p>
    </div>
  );
}
