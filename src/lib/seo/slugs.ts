export type SlugRegionRecord = {
  id: string;
  code: string;
  name: string;
};

export type SlugTonnageRecord = {
  id: string;
  code: string;
  name: string;
  weightKg: number | null;
};

export function regionSlug(region: { code: string }): string {
  return region.code.toLowerCase();
}

export function tonnageSlug(tonnage: SlugTonnageRecord): string {
  if (tonnage.weightKg != null && tonnage.weightKg > 0) {
    return `${tonnage.weightKg / 1000}ton`;
  }
  return tonnage.code.toLowerCase();
}

export function buildRegionSlugMap(
  regions: SlugRegionRecord[],
): Map<string, SlugRegionRecord> {
  const map = new Map<string, SlugRegionRecord>();
  for (const region of regions) {
    const slug = regionSlug(region);
    if (!map.has(slug)) map.set(slug, region);
  }
  return map;
}

export function buildTonnageSlugMap(
  tonnages: SlugTonnageRecord[],
): Map<string, SlugTonnageRecord> {
  const map = new Map<string, SlugTonnageRecord>();
  for (const tonnage of tonnages) {
    const slug = tonnageSlug(tonnage);
    if (!map.has(slug)) map.set(slug, tonnage);
  }
  return map;
}
