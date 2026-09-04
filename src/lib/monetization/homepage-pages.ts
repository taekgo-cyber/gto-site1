import { HOMEPAGE_AD_PAGE_INTERVAL_MS } from "./policy";

export function splitAdvertisementPages<T extends { id: string }>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("INVALID_PAGE_SIZE");
  const unique = items.filter((ad, index) => items.findIndex(other => other.id === ad.id) === index);
  return Array.from({ length: Math.ceil(unique.length / size) }, (_, page) => unique.slice(page * size, (page + 1) * size));
}

export type PagePause = "hover" | "focus" | "motion" | "user" | "hidden";

/** Shared, disposable timer for all three tiers. Every interaction starts a fresh interval. */
export function createAdvertisementPager(count: number, onPage: (page: number) => void, initialPage = 0) {
  let page = initialPage < count ? initialPage : 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pauses = new Set<PagePause>();
  const schedule = () => {
    clearTimeout(timer);
    if (!disposed && count > 1 && !pauses.size) timer = setTimeout(() => move(1), HOMEPAGE_AD_PAGE_INTERVAL_MS);
  };
  const move = (delta: number) => {
    if (disposed || count < 1) return;
    page = (page + delta + count) % count;
    onPage(page);
    schedule();
  };
  return {
    start: schedule,
    move,
    pause(reason: PagePause, paused: boolean) {
      if (paused) pauses.add(reason); else pauses.delete(reason);
      schedule();
    },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
