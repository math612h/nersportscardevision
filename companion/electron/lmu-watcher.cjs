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
  constructor({ seenFiles, onNewResults, onStatus, pollMs, customFolder }) {
    this.seen = seenFiles;
    this.onNewResults = onNewResults;
    this.onStatus = onStatus;
    this.pollMs = pollMs || 10_000;
    this.timer = null;
    this.folder = null;
    this.customFolder = customFolder || null;
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

    const files = listXmlFiles(this.folder);
    for (const f of files) {
      const key = f.name;
      if (this.seen.has(key)) continue;
      try {
        const parsed = parseFile(f.path);
        this.seen.add(key);
        await this.onNewResults({ filePath: f.path, fileName: f.name, parsed });
      } catch (err) {
        console.warn(`[lmu-watcher] failed to parse ${f.name}:`, err.message);
        this.seen.add(key);
      }
    }
  }

  async scanAll() {
    if (!this.folder) this.folder = findResultsFolder(this.customFolder);
    if (!this.folder) return { uploaded: 0, total: 0 };
    const files = listXmlFiles(this.folder);
    let uploaded = 0;
    for (const f of files) {
      if (this.seen.has(f.name)) continue;
      try {
        const parsed = parseFile(f.path);
        this.seen.add(f.name);
        const res = await this.onNewResults({ filePath: f.path, fileName: f.name, parsed });
        if (res && res.uploaded) uploaded += res.uploaded;
      } catch (err) {
        this.seen.add(f.name);
      }
    }
    return { uploaded, total: files.length };
  }
}

module.exports = { LmuWatcher, findResultsFolder, candidateResultsFolders };
