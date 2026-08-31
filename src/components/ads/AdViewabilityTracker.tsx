"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createViewabilityController } from "@/lib/monetization/viewability";

const recordedCampaignsForPage = new Set<string>();

export function AdViewabilityTracker({
  campaignId,
  enabled = true,
  className,
  children,
}: {
  campaignId: string;
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const element = elementRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const pageLoadId = `${window.location.pathname}:${window.performance.timeOrigin}`;
    const pageCampaignKey = `${pageLoadId}:${campaignId}`;
    const controller = createViewabilityController({
      campaignId: pageCampaignKey,
      dedupeSet: recordedCampaignsForPage,
      isDocumentVisible: () => document.visibilityState === "visible",
      record: () => {
        void fetch(`/api/ads/${encodeURIComponent(campaignId)}/impression`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dedupeKey: pageCampaignKey }),
          keepalive: true,
        }).catch(() => undefined);
      },
    });
    const observer = new IntersectionObserver(
      ([entry]) => controller.setIntersection(entry.intersectionRatio, entry.isIntersecting),
      { threshold: [0, 0.5, 1] },
    );
    const onVisibilityChange = () => controller.handleVisibilityChange();
    observer.observe(element);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.dispose();
    };
  }, [campaignId, enabled]);

  return <div ref={elementRef} className={className} data-ad-campaign-id={campaignId}>{children}</div>;
}
