// Persistent encrypted token store for the Supabase session.
// Uses Electron's safeStorage (Windows DPAPI) so the token can only be
// decrypted by the same user on the same machine.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = path.join(app.getPath("userData"), "session.bin");
const SEEN_FILES = path.join(app.getPath("userData"), "seen-files.json");

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

module.exports = { saveSession, loadSession, clearSession, loadSeenFiles, saveSeenFiles };
