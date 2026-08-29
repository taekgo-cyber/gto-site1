"use client";

import { useEffect } from "react";

type PublicAd = {
  id: string;
  title: string;
  linkUrl: string | null;
  companyName: string | null;
};

export function AdPlacementSlot({ campaigns }: { campaigns: PublicAd[] }) {
  useEffect(() => {
    if (campaigns.length === 0) return;
    const pageLoadId = `${window.location.pathname}:${window.performance.timeOrigin}`;
    for (const campaign of campaigns) {
      void fetch(`/api/ads/${encodeURIComponent(campaign.id)}/impression`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dedupeKey: `${campaign.id}:${pageLoadId}` }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [campaigns]);

  if (campaigns.length === 0) return null;
  return (
    <section aria-label="광고" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 py-3 sm:px-6 lg:px-8">
        {campaigns.map((campaign) => {
          const content = <><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">광고</span><span className="text-[15px] font-semibold leading-snug">{campaign.title}</span>{campaign.companyName ? <span className="text-[13px] text-muted-foreground">{campaign.companyName}</span> : null}</>;
          return campaign.linkUrl ? (
            <a key={campaign.id} href={`/api/ads/${encodeURIComponent(campaign.id)}/click`} rel="sponsored noopener noreferrer" className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-4 py-3 text-[15px] transition-colors hover:bg-surface">{content}</a>
          ) : (
            <div key={campaign.id} className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-4 py-3 text-[15px]">{content}</div>
          );
        })}
      </div>
    </section>
  );
}
