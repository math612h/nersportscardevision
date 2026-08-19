export type CapConfig = {
  car_class?: string | null;
  driver_category?: string | null;
  max_drivers?: number | null;
};

/**
 * Grid capacity is defined per CAR CLASS — not per driver category.
 * When a class is split into Pro/Am, both configs carry the same cap and it
 * still represents the total number of seats in that class.
 */
export function classCap(configs: CapConfig[], carClass?: string | null): number | null {
  if (!carClass) return null;
  const caps = configs
    .filter((c) => c.car_class === carClass)
    .map((c) => (typeof c.max_drivers === "number" && c.max_drivers > 0 ? c.max_drivers : null));
  if (caps.length === 0) return null;
  if (caps.some((c) => c == null)) return null;
  return Math.max(...(caps as number[]));
}

/** Unique car classes present in the configs, in original order. */
export function uniqueCarClasses(configs: CapConfig[]): string[] {
  return Array.from(
    new Set(configs.map((c) => c.car_class).filter((c): c is string => !!c)),
  );
}
