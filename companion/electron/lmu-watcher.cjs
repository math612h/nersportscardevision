// Watches the LMU results folder and emits parsed race results for new files.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseLmuRaceFile } = require("./lmu-parser.cjs");

function candidateResultsFolders() {
  const home = os.homedir();
  return [
    path.join(home, "Documents", "My Games", "LeMansUltimate", "UserData", "Log", "Results"),
    path.join(home, "Documents", "Le Mans Ultimate", "UserData", "Log", "Results"),
  ];
}

function findResultsFolder() {
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
  constructor({ seenFiles, onNewResults, onStatus, pollMs }) {
    this.seen = seenFiles; // Set of file basenames already processed
    this.onNewResults = onNewResults;
    this.onStatus = onStatus;
    this.pollMs = pollMs || 10_000;
    this.timer = null;
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
    if (!this.folder) this.folder = findResultsFolder();
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
        // Mark as seen so we don't retry forever — but log
        console.warn(`[lmu-watcher] failed to parse ${f.name}:`, err.message);
        this.seen.add(key);
      }
    }
  }

  // Re-process all existing files (used right after login to catch up on history)
  async scanAll() {
    if (!this.folder) this.folder = findResultsFolder();
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
