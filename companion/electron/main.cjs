// Main Electron process — system tray, auto-start, login flow, LMU watcher.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const { POLL_INTERVAL_MS } = require("./config.cjs");
const authStore = require("./auth-store.cjs");
const uploader = require("./uploader.cjs");
const { LmuWatcher } = require("./lmu-watcher.cjs");

// Single instance — second launch just shows existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let watcher = null;
let session = null;
let deviceToken = null; // Set when user logs in with engangsnøgle (mutually exclusive med session)
let userInfo = null; // { display_name, lmu_name, approved }
let lmuStatus = { lmuFound: false, folder: null };
let uploadCount = 0;
let lastError = null;

// ---- Auto-start at Windows login (silent, in background) -------------------
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
  args: ["--hidden"],
});

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 620,
    show: false,
    resizable: false,
    backgroundColor: "#0b0b0f",
    title: "NER Sportscar Companion",
    autoHideMenuBar: true,
    icon: getTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexHtml);

  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function getTrayIcon() {
  // 16x16 transparent PNG with a red circle — minimal embedded icon to avoid
  // shipping a separate file. Replace with build/icon.ico for production polish.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAYklEQVQ4y2NkYGD4z0ABYBxVQF8FLAyMjAz/GRgYGP7//4+hgImBgYGB4f///wxMDAwMDP///2dgYmBgYPj//z8DEwMDA8P///8ZmBgYGBj+//8/AxMDAwPD//9/AABnsAv7p9LWzAAAAABJRU5ErkJggg==",
    "base64"
  );
  return nativeImage.createFromBuffer(png);
}

function showWindow() {
  if (!win) createWindow();
  win.show();
  win.focus();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: userInfo ? `Logget ind som ${userInfo.display_name || "bruger"}` : "Ikke logget ind", enabled: false },
    { label: `LMU: ${lmuStatus.lmuFound ? "fundet" : "ikke fundet"}`, enabled: false },
    { label: `Uploadede tider: ${uploadCount}`, enabled: false },
    { type: "separator" },
    { label: "Åbn vindue", click: () => showWindow() },
    { label: "Scan nu", click: () => triggerScan() },
    { label: "Åbn leaderboard", click: () => shell.openExternal("https://nersportscardevision.lovable.app/leaderboard") },
    { type: "separator" },
    {
      label: "Log ud",
      enabled: !!session || !!deviceToken,
      click: async () => {
        authStore.clearSession();
        authStore.clearDeviceToken();
        session = null;
        deviceToken = null;
        userInfo = null;
        if (watcher) { watcher.stop(); watcher = null; }
        updateStatus();
        showWindow();
      },
    },
    { label: "Afslut", click: () => { app.isQuiting = true; app.quit(); } },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(
    `NER Sportscar Companion\n${userInfo ? "Logget ind" : "Ikke logget ind"} · LMU ${lmuStatus.lmuFound ? "fundet" : "mangler"}`
  );
  tray.setContextMenu(buildTrayMenu());
}

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function updateStatus() {
  refreshTray();
  broadcast("status:update", {
    signedIn: !!session || !!deviceToken,
    user: userInfo,
    lmu: lmuStatus,
    uploadCount,
    lastError,
  });
}

async function triggerScan() {
  if ((!session && !deviceToken) || !watcher) return { uploaded: 0 };
  try {
    const res = await watcher.scanAll();
    return res;
  } catch (err) {
    lastError = err.message;
    updateStatus();
    return { uploaded: 0, error: err.message };
  }
}

function startWatcher() {
  if (watcher) watcher.stop();
  const seen = authStore.loadSeenFiles();
  const customFolder = authStore.loadCustomFolder();

  watcher = new LmuWatcher({
    seenFiles: seen,
    pollMs: POLL_INTERVAL_MS,
    customFolder,
    onStatus: (s) => {
      const changed = s.lmuFound !== lmuStatus.lmuFound || s.folder !== lmuStatus.folder;
      lmuStatus = s;
      if (changed) updateStatus();
    },
    onNewResults: async ({ filePath, fileName, parsed }) => {
      try {
        const res = deviceToken
          ? await uploader.uploadParsedResultsViaToken({ token: deviceToken, filePath })
          : await uploader.uploadParsedResults({ session, parsed });
        if (res.uploaded > 0) {
          uploadCount += res.uploaded;
          updateStatus();
        }
        authStore.saveSeenFiles(seen);
        return res;
      } catch (err) {
        console.error(`[upload] ${fileName} failed:`, err);
        lastError = err.message;
        updateStatus();
        return { uploaded: 0, error: err.message };
      }
    },
  });
  watcher.start();
}

async function restoreOnStartup() {
  // 1) Prøv device-token først (foretrukket flow)
  const savedToken = authStore.loadDeviceToken();
  if (savedToken) {
    try {
      const { user } = await uploader.verifyDeviceToken(savedToken);
      deviceToken = savedToken;
      userInfo = {
        id: user.id,
        email: null,
        display_name: user.display_name || "Bruger",
        lmu_name: user.lmu_name || null,
        approved: !!user.approved,
      };
      startWatcher();
      updateStatus();
      return;
    } catch (err) {
      console.error("[restore-token] failed:", err);
      authStore.clearDeviceToken();
    }
  }

  // 2) Fallback: gammel Supabase-session
  const saved = authStore.loadSession();
  if (!saved) { updateStatus(); return; }
  try {
    session = await uploader.restoreSession(saved);
    authStore.saveSession(session);
    const { user, profile } = await uploader.getUserProfile(session);
    userInfo = {
      id: user.id,
      email: user.email,
      display_name: profile?.display_name || user.email,
      lmu_name: profile?.lmu_name || null,
      approved: !!profile?.approved,
    };
    startWatcher();
  } catch (err) {
    console.error("[restore] failed:", err);
    authStore.clearSession();
    session = null;
    userInfo = null;
  }
  updateStatus();
}

// ---- IPC handlers ----------------------------------------------------------
ipcMain.handle("auth:status", () => ({
  signedIn: !!session || !!deviceToken,
  user: userInfo,
  lmu: lmuStatus,
  uploadCount,
  lastError,
}));

ipcMain.handle("auth:signIn", async (_e, { email, password }) => {
  try {
    session = await uploader.signInWithPassword(email, password);
    authStore.saveSession(session);
    const { user, profile } = await uploader.getUserProfile(session);
    userInfo = {
      id: user.id,
      email: user.email,
      display_name: profile?.display_name || user.email,
      lmu_name: profile?.lmu_name || null,
      approved: !!profile?.approved,
    };
    startWatcher();
    updateStatus();
    return { ok: true, user: userInfo };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("auth:sendOtp", async (_e, { email }) => {
  try {
    await uploader.sendEmailOtp(email);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("auth:verifyOtp", async (_e, { email, token }) => {
  try {
    session = await uploader.verifyEmailOtp(email, token);
    authStore.saveSession(session);
    const { user, profile } = await uploader.getUserProfile(session);
    userInfo = {
      id: user.id,
      email: user.email,
      display_name: profile?.display_name || user.email,
      lmu_name: profile?.lmu_name || null,
      approved: !!profile?.approved,
    };
    startWatcher();
    updateStatus();
    return { ok: true, user: userInfo };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("auth:signInWithToken", async (_e, { token }) => {
  try {
    const cleaned = String(token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(cleaned)) {
      return { ok: false, error: "Ugyldigt nøgleformat. Generér en ny på din profil." };
    }
    const { user } = await uploader.verifyDeviceToken(cleaned);
    deviceToken = cleaned;
    session = null;
    authStore.clearSession();
    authStore.saveDeviceToken(cleaned);
    userInfo = {
      id: user.id,
      email: null,
      display_name: user.display_name || "Bruger",
      lmu_name: user.lmu_name || null,
      approved: !!user.approved,
    };
    startWatcher();
    updateStatus();
    return { ok: true, user: userInfo };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("auth:signOut", async () => {
  authStore.clearSession();
  authStore.clearDeviceToken();
  session = null;
  deviceToken = null;
  userInfo = null;
  if (watcher) { watcher.stop(); watcher = null; }
  updateStatus();
  return { ok: true };
});

ipcMain.handle("lmu:status", () => ({ ...lmuStatus, uploadCount }));
ipcMain.handle("lmu:scanNow", () => triggerScan());

// ---- App lifecycle ---------------------------------------------------------
app.on("second-instance", () => showWindow());

app.whenReady().then(async () => {
  // Tray icon
  tray = new Tray(getTrayIcon());
  tray.setToolTip("NER Sportscar Companion");
  tray.on("click", () => showWindow());
  refreshTray();

  createWindow();

  // If not launched with --hidden, show window on first launch (after install)
  const hidden = process.argv.includes("--hidden");
  if (!hidden) {
    win.once("ready-to-show", () => showWindow());
  }

  await restoreOnStartup();
});

app.on("window-all-closed", (e) => {
  // Keep app alive in tray even when window is closed
  e.preventDefault();
});
