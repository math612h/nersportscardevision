// Watches the LMU results folder and emits parsed race results for new files.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseLmuRaceFile } = require("./lmu-parser.cjs");

function candidateResultsFolders() {
  const home = os.homedir();
  const list = [
    path.join(home, "Documents", "My Games", "LeMansUltimate", "UserData", "Log", "Results"),
    path.join(home, "Documents", "My Games", "Le Mans Ultimate", "UserData", "Log", "Results"),
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
  const suffix = path.join("steamapps", "common", "Le Mans Ultimate", "UserData", "Log", "Results");
  for (const r of steamRoots) {
    list.push(path.join(r, suffix));
  }
  // Windows VirtualStore — LMU writes here when installed under Program Files
  // without admin rights. Stifinder viser dem "smeltet sammen" med Program Files,
  // men det fysiske disk-location er VirtualStore.
  const virtualStoreRoot = path.join(home, "AppData", "Local", "VirtualStore");
  for (const r of steamRoots) {
    // Strip drive letter — VirtualStore mirrors paths under Program Files only
    const rel = r.replace(/^[A-Za-z]:[/\\]?/, "");
    list.push(path.join(virtualStoreRoot, rel, suffix));
  }
  return list;
}

function unique(paths) {
  const seen = new Set();
  return paths.filter((p) => {
    const key = String(p || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function virtualStoreMirrorFor(folder) {
  const raw = String(folder || "").trim();
  if (!/^[A-Za-z]:[/\\]/.test(raw)) return null;
  const withoutDrive = raw.replace(/^[A-Za-z]:[/\\]+/, "");
  const lower = withoutDrive.toLowerCase();
  if (!lower.startsWith("program files") && !lower.startsWith("program files (x86)")) return null;
  return path.join(os.homedir(), "AppData", "Local", "VirtualStore", withoutDrive);
}

function expandFolderAlternates(folder) {
  const raw = String(folder || "").trim();
  if (!raw) return [];
  const variants = [raw];
  if (path.basename(raw).toLowerCase() !== "results") variants.push(path.join(raw, "Results"));
  const mirror = virtualStoreMirrorFor(raw);
  if (mirror) {
    variants.push(mirror);
    if (path.basename(mirror).toLowerCase() !== "results") variants.push(path.join(mirror, "Results"));
  }
  return unique(variants);
}

function isDirectory(folder) {
  try { return fs.statSync(folder).isDirectory(); } catch { return false; }
}

function xmlCount(folder) {
  try { return fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".xml")).length; } catch { return 0; }
}

function findResultsFolder(customFolder) {
  if (customFolder) {
    const customCandidates = expandFolderAlternates(customFolder).filter(isDirectory);
    const withFiles = customCandidates.find((p) => xmlCount(p) > 0);
    if (withFiles) return withFiles;
    if (customCandidates[0]) return customCandidates[0];
  }
  const candidates = unique(candidateResultsFolders()).filter(isDirectory);
  return candidates.find((p) => xmlCount(p) > 0) || candidates[0] || null;
}

function listXmlFiles(folder) {
  let entries;
  try {
    entries = fs.readdirSync(folder);
  } catch (err) {
    const e = new Error(`Kunne ikke læse mappen "${folder}" (${err.code || "ukendt fejl"}): ${err.message}`);
    e.code = err.code;
    throw e;
  }
  const xmls = entries.filter((f) => f.toLowerCase().endsWith(".xml"));
  const out = [];
  for (const f of xmls) {
    const full = path.join(folder, f);
    try {
      out.push({ path: full, name: f, mtime: fs.statSync(full).mtimeMs });
    } catch {
      out.push({ path: full, name: f, mtime: 0 });
    }
  }
  return out.sort((a, b) => a.mtime - b.mtime);
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
    this.initialScanDone = false;
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

    let files;
    try { files = listXmlFiles(this.folder); } catch (err) { console.warn("[lmu-watcher] readdir failed:", err.message); return; }
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
      let files;
      try {
        files = listXmlFiles(this.folder);
      } catch (err) {
        const result = { uploaded: 0, total: 0, processed: 0, skipped: 0, errors: 1, note: err.message };
        if (this.onScanComplete) this.onScanComplete(result, { markFullScan: false });
        return result;
      }
      let uploaded = 0;
      let processed = 0;
      let skipped = 0;
      let duplicates = 0;
      let errors = 0;
      let lastNote = null;
      let notInFileCount = 0;
      for (const f of files) {
        try {
          const parsed = parseFile(f.path);
          const res = await this.onNewResults({ filePath: f.path, fileName: f.name, parsed });
          if (res && res.error) { errors += 1; lastNote = res.error; }
          if (res && !res.error) processed += 1;
          if (res && res.uploaded) uploaded += res.uploaded;
          if (res && res.skipped) skipped += res.skipped;
          if (res && res.duplicates) duplicates += res.duplicates;
          if (res && (res.note || res.reason)) lastNote = res.note || res.reason;
          if (res && res.note === "Du var ikke i filen — sprunget over") notInFileCount += 1;
          if (res && !res.error) { this.seen.add(f.name); if (this.onSeenChanged) this.onSeenChanged(this.seen); }
        } catch (err) {
          console.warn(`[lmu-watcher] failed to parse ${f.name}:`, err.message);
          errors += 1;
          lastNote = err.message;
        }
      }
      // Don't let a single "not in file" note from one file mislead when
      // other files were processed fine (duplicates or uploads).
      if ((uploaded > 0 || duplicates > 0) && lastNote === "Du var ikke i filen — sprunget over") {
        lastNote = null;
      }
      const result = { uploaded, total: files.length, processed, skipped, duplicates, errors, note: lastNote };
      if (this.onScanComplete) this.onScanComplete(result, { markFullScan });
      return result;
    } finally {
      this.scanRunning = false;
    }
  }
}

module.exports = { LmuWatcher, findResultsFolder, candidateResultsFolders };
