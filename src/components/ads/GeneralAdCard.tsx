import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function GeneralAdCard({
  advertisement,
  trackingEnabled = true,
}: {
  advertisement: PublicHomepageAdvertisement;
  trackingEnabled?: boolean;
}) {
  return (
    <AdViewabilityTracker campaignId={advertisement.id} enabled={trackingEnabled} className="h-full">
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full min-h-40 flex-col rounded-xl border border-border border-l-[3px] border-l-primary/55 bg-background p-4 shadow-sm transition hover:border-primary/35 hover:bg-blue-50/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <p className="text-xs font-bold text-primary">GENERAL · 스폰서</p>
        <h3 className="mt-2 line-clamp-2 text-[17px] font-bold leading-snug">{advertisement.title}</h3>
        <AdvertisementDetails advertisement={advertisement} compact />
        <div className="mt-auto flex items-end justify-between gap-3 pt-3 text-sm text-muted-foreground"><p className="truncate">{advertisement.companyName}</p><span aria-hidden="true" className="shrink-0 font-bold text-primary transition-transform group-hover:translate-x-0.5">→</span></div>
      </a>
    </AdViewabilityTracker>
  );
}
