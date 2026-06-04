// Watches the LMU results folder and emits parsed race results for new files.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseLmuRaceFile } = require("./lmu-parser.cjs");

function candidateResultsFolders() {
  const home = os.homedir();
  const list = [
    path.join(home, "Documents", "My Games", "LeMansUltimate", "UserData", "Log", "Results"),
    path.join(home, "Documents", "Le Mans Ultimate", "UserData", "Log", "Results"),
  ];
  // Common Steam install locations
  const steamRoots = [
    "C:/Program Files (x86)/Steam",
    "C:/Program Files/Steam",
    "D:/Steam",
    "D:/SteamLibrary",
    "E:/Steam",
    "E:/SteamLibrary",
    "C:/SteamLibrary",
  ];
  for (const r of steamRoots) {
    list.push(path.join(r, "steamapps", "common", "Le Mans Ultimate", "UserData", "Log", "Results"));
  }
  return list;
}

function findResultsFolder(customFolder) {
  if (customFolder) {
    try { if (fs.statSync(customFolder).isDirectory()) return customFolder; } catch {}
  }
  for (const p of candidateResultsFolders()) {
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch {}
  }
  return null;
}

function listXmlFiles(folder) {
  try {
    return fs
      .readdirSync(folder)
      .filter((f) => f.toLowerCase().endsWith(".xml"))
      .map((f) => ({
        path: path.join(folder, f),
        name: f,
        mtime: fs.statSync(path.join(folder, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime);
  } catch {
    return [];
  }
}

function parseFile(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  return parseLmuRaceFile(xml);
}

class LmuWatcher {
  constructor({ seenFiles, onNewResults, onStatus, onScanComplete, onSeenChanged, initialFullScanDone, pollMs, customFolder }) {
    this.seen = seenFiles;
    this.onNewResults = onNewResults;
    this.onStatus = onStatus;
    this.onScanComplete = onScanComplete;
    this.onSeenChanged = onSeenChanged;
    this.pollMs = pollMs || 10_000;
    this.timer = null;
    this.folder = null;
    this.customFolder = customFolder || null;
    this.initialScanDone = !!initialFullScanDone;
    this.scanRunning = false;
  }

  setCustomFolder(folder) {
    this.customFolder = folder || null;
    this.folder = null;
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (!this.folder) this.folder = findResultsFolder(this.customFolder);
    if (!this.folder) {
      this.onStatus({ lmuFound: false, folder: null });
      return;
    }
    this.onStatus({ lmuFound: true, folder: this.folder });

    if (!this.initialScanDone) {
      this.initialScanDone = true;
      await this.scanAll({ markFullScan: true });
      return;
    }

    const files = listXmlFiles(this.folder);
    for (const f of files) {
      const key = f.name;
      if (this.seen.has(key)) continue;
      try {
        const parsed = parseFile(f.path);
        const res = await this.onNewResults({ filePath: f.path, fileName: f.name, parsed });
        if (res && !res.error) { this.seen.add(key); if (this.onSeenChanged) this.onSeenChanged(this.seen); }
      } catch (err) {
        console.warn(`[lmu-watcher] failed to parse ${f.name}:`, err.message);
      }
    }
  }

  // Force re-scan ALL files in the folder, ignoring the seen-list.
  async scanAll({ markFullScan = false } = {}) {
    if (this.scanRunning) return { uploaded: 0, total: 0, processed: 0, skipped: 0, errors: 0, busy: true };
    this.scanRunning = true;
    if (!this.folder) this.folder = findResultsFolder(this.customFolder);
    if (!this.folder) { this.scanRunning = false; return { uploaded: 0, total: 0, processed: 0, skipped: 0, errors: 0 }; }
    try {
      const files = listXmlFiles(this.folder);
      let uploaded = 0;
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      let lastNote = null;
      for (const f of files) {
        try {
          const parsed = parseFile(f.path);
          const res = await this.onNewResults({ filePath: f.path, fileName: f.name, parsed });
          if (res && !res.error) processed += 1;
          if (res && res.uploaded) uploaded += res.uploaded;
          if (res && res.skipped) skipped += res.skipped;
          if (res && (res.note || res.reason)) lastNote = res.note || res.reason;
          if (res && !res.error) { this.seen.add(f.name); if (this.onSeenChanged) this.onSeenChanged(this.seen); }
        } catch (err) {
          console.warn(`[lmu-watcher] failed to parse ${f.name}:`, err.message);
          errors += 1;
          lastNote = err.message;
        }
      }
      const result = { uploaded, total: files.length, processed, skipped, errors, note: lastNote };
      if (this.onScanComplete) this.onScanComplete(result, { markFullScan });
      return result;
    } finally {
      this.scanRunning = false;
    }
  }
}

module.exports = { LmuWatcher, findResultsFolder, candidateResultsFolders };
