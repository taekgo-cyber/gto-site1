import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function GeneralAdCard({ advertisement, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean }) {
  return (
    <AdViewabilityTracker campaignId={advertisement.id} enabled={trackingEnabled} className="h-full">
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="flex h-full min-h-44 flex-col rounded-lg border border-border bg-background p-4 transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <p className="text-xs font-medium text-muted-foreground">광고 · 스폰서 공고</p>
        <h3 className="mt-2 line-clamp-2 text-[17px] font-bold leading-snug">{advertisement.title}</h3>
        <AdvertisementDetails advertisement={advertisement} compact />
        <p className="mt-auto pt-3 text-sm text-muted-foreground">{advertisement.companyName}</p>
      </a>
    </AdViewabilityTracker>
  );
}
