// Patch vs. hotfix regler for Le Mans Ultimate versionsstrenge.
//
// Spillet rapporterer versioner i to formater:
//   - Dotted:   "1.3.2.2", "1.3.3.4"   (major.minor.hotfix.build)
//   - Legacy:   "1.3000", "1.4000", "0.9200"  (major.<minor+build sammenskrevet>)
//
// Aftale:
//   Patch  = major.minor  (fx 1.3, 1.4). Ny patch nulstiller "aktuel patch".
//   Hotfix = alt efter major.minor. Hotfixes tæller som SAMME patch.
//
// Så både "1.3000", "1.3.2.2" og "1.3.3.4" normaliseres til "1.3".

export function normalizePatch(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const parts = v.split(".");
  const major = parts[0] ?? "";
  let minor = parts[1] ?? "0";
  // Legacy komprimeret format ("1.3000") – kun første ciffer i felt 2 er reel minor.
  if (parts.length === 2 && minor.length >= 3) minor = minor.charAt(0);
  if (!major) return null;
  return `${major}.${minor}`;
}

export function comparePatchDesc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return y - x;
  }
  return 0;
}

export function pickCurrentPatch(rawVersions: Array<string | null | undefined>): string | null {
  const set = new Set<string>();
  for (const r of rawVersions) {
    const n = normalizePatch(r);
    if (n) set.add(n);
  }
  return Array.from(set).sort(comparePatchDesc)[0] ?? null;
}
