// Persistent encrypted token store for the Supabase session.
// Uses Electron's safeStorage (Windows DPAPI) so the token can only be
// decrypted by the same user on the same machine.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = path.join(app.getPath("userData"), "session.bin");
const TOKEN_FILE = path.join(app.getPath("userData"), "device-token.bin");
const SEEN_FILES = path.join(app.getPath("userData"), "seen-files.json");

function saveDeviceToken(token) {
  try {
    if (!token) {
      if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
      if (fs.existsSync(TOKEN_FILE + ".plain")) fs.unlinkSync(TOKEN_FILE + ".plain");
      return;
    }
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(TOKEN_FILE, safeStorage.encryptString(token));
    } else {
      fs.writeFileSync(TOKEN_FILE + ".plain", token);
    }
  } catch (err) {
    console.error("[auth-store] saveDeviceToken failed:", err);
  }
}

function loadDeviceToken() {
  try {
    if (fs.existsSync(TOKEN_FILE) && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(fs.readFileSync(TOKEN_FILE));
    }
    const plain = TOKEN_FILE + ".plain";
    if (fs.existsSync(plain)) return fs.readFileSync(plain, "utf8");
  } catch (err) {
    console.error("[auth-store] loadDeviceToken failed:", err);
  }
  return null;
}

function clearDeviceToken() {
  saveDeviceToken(null);
}

function saveSession(session) {
  try {
    if (!session) {
      if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
      return;
    }
    const json = JSON.stringify(session);
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(FILE, safeStorage.encryptString(json));
    } else {
      // Fallback: write plain (still in userData which is per-user)
      fs.writeFileSync(FILE + ".plain", json);
    }
  } catch (err) {
    console.error("[auth-store] save failed:", err);
  }
}

function loadSession() {
  try {
    if (fs.existsSync(FILE) && safeStorage.isEncryptionAvailable()) {
      const buf = fs.readFileSync(FILE);
      const json = safeStorage.decryptString(buf);
      return JSON.parse(json);
    }
    const plain = FILE + ".plain";
    if (fs.existsSync(plain)) return JSON.parse(fs.readFileSync(plain, "utf8"));
  } catch (err) {
    console.error("[auth-store] load failed:", err);
  }
  return null;
}

function clearSession() {
  saveSession(null);
  try {
    if (fs.existsSync(FILE + ".plain")) fs.unlinkSync(FILE + ".plain");
  } catch (err) {
    console.error("[auth-store] clear failed:", err);
  }
}

function loadSeenFiles() {
  try {
    if (fs.existsSync(SEEN_FILES)) {
      return new Set(JSON.parse(fs.readFileSync(SEEN_FILES, "utf8")));
    }
  } catch (err) {
    console.error("[auth-store] loadSeenFiles failed:", err);
  }
  return new Set();
}

function saveSeenFiles(set) {
  try {
    // Keep only last 500 entries to avoid unbounded growth
    const arr = Array.from(set);
    const trimmed = arr.slice(-500);
    fs.writeFileSync(SEEN_FILES, JSON.stringify(trimmed));
  } catch (err) {
    console.error("[auth-store] saveSeenFiles failed:", err);
  }
}

const FOLDER_FILE = path.join(app.getPath("userData"), "custom-folder.txt");
function saveCustomFolder(folder) {
  try {
    if (!folder) { if (fs.existsSync(FOLDER_FILE)) fs.unlinkSync(FOLDER_FILE); return; }
    fs.writeFileSync(FOLDER_FILE, folder, "utf8");
  } catch (err) { console.error("[auth-store] saveCustomFolder failed:", err); }
}
function loadCustomFolder() {
  try { if (fs.existsSync(FOLDER_FILE)) return fs.readFileSync(FOLDER_FILE, "utf8").trim() || null; } catch {}
  return null;
}

module.exports = { saveSession, loadSession, clearSession, saveDeviceToken, loadDeviceToken, clearDeviceToken, loadSeenFiles, saveSeenFiles, saveCustomFolder, loadCustomFolder };
