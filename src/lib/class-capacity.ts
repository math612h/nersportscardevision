export type CapConfig = {
  car_class?: string | null;
  driver_category?: string | null;
  max_drivers?: number | null;
};

function positive(n: unknown): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

/** Configs belonging to a car class. */
export function classConfigs(configs: CapConfig[], carClass?: string | null): CapConfig[] {
  if (!carClass) return [];
  return configs.filter((c) => c.car_class === carClass);
}

/** True when a class is split into several driver categories (fx Pro/Am). */
export function isSplitClass(configs: CapConfig[], carClass?: string | null): boolean {
  return (
    new Set(classConfigs(configs, carClass).map((c) => c.driver_category ?? "")).size > 1
  );
}

/** Cap for a single (car_class, driver_category) config. */
export function categoryCap(
  configs: CapConfig[],
  carClass?: string | null,
  category?: string | null,
): number | null {
  const cfg = classConfigs(configs, carClass).find((c) => c.driver_category === category);
  return cfg ? positive(cfg.max_drivers) : null;
}

/**
 * Total seats for a car class — the sum of its category caps.
 * Returns null when the class has no cap configured (unlimited).
 */
export function classCap(configs: CapConfig[], carClass?: string | null): number | null {
  const caps = classConfigs(configs, carClass).map((c) => positive(c.max_drivers));
  if (caps.length === 0) return null;
  if (caps.some((c) => c == null)) return null;
  return (caps as number[]).reduce((a, b) => a + b, 0);
}

/**
 * The cap that actually gates a signup: per category when the class is split
 * into Pro/Am, otherwise the class total.
 */
export function seatCap(
  configs: CapConfig[],
  carClass?: string | null,
  category?: string | null,
): number | null {
  if (isSplitClass(configs, carClass)) return categoryCap(configs, carClass, category);
  return classCap(configs, carClass);
}

/** Unique car classes present in the configs, in original order. */
export function uniqueCarClasses(configs: CapConfig[]): string[] {
  return Array.from(
    new Set(configs.map((c) => c.car_class).filter((c): c is string => !!c)),
  );
}

/**
 * Capacity buckets to enforce: one per category for split classes,
 * one per class otherwise.
 */
export function capacityBuckets(
  configs: CapConfig[],
): Array<{ carClass: string; category: string | null; cap: number | null }> {
  const out: Array<{ carClass: string; category: string | null; cap: number | null }> = [];
  for (const carClass of uniqueCarClasses(configs)) {
    if (isSplitClass(configs, carClass)) {
      for (const c of classConfigs(configs, carClass)) {
        out.push({
          carClass,
          category: (c.driver_category as string | null) ?? null,
          cap: positive(c.max_drivers),
        });
      }
    } else {
      out.push({ carClass, category: null, cap: classCap(configs, carClass) });
    }
  }
  return out;
}
