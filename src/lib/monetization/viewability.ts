export type ViewabilityController = {
  setIntersection: (ratio: number, isIntersecting: boolean) => void;
  handleVisibilityChange: () => void;
  dispose: () => void;
};

export function createViewabilityController(input: {
  campaignId: string;
  dedupeSet: Set<string>;
  isDocumentVisible: () => boolean;
  record: () => void;
  dwellMs?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}): ViewabilityController {
  const dwellMs = input.dwellMs ?? 1_000;
  const schedule = input.schedule ?? setTimeout;
  const cancel = input.cancel ?? clearTimeout;
  let ratio = 0;
  let intersecting = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const stop = () => {
    if (timer) cancel(timer);
    timer = null;
  };
  const start = () => {
    stop();
    if (
      disposed ||
      input.dedupeSet.has(input.campaignId) ||
      !intersecting ||
      ratio < 0.5 ||
      !input.isDocumentVisible()
    ) return;
    timer = schedule(() => {
      timer = null;
      if (
        disposed ||
        input.dedupeSet.has(input.campaignId) ||
        !intersecting ||
        ratio < 0.5 ||
        !input.isDocumentVisible()
      ) return;
      input.dedupeSet.add(input.campaignId);
      input.record();
    }, dwellMs);
  };
  return {
    setIntersection(nextRatio, nextIntersecting) {
      ratio = nextRatio;
      intersecting = nextIntersecting;
      start();
    },
    handleVisibilityChange() {
      start();
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
