import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function PremiumAdCard({ advertisement, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean }) {
  return (
    <AdViewabilityTracker campaignId={advertisement.id} enabled={trackingEnabled} className="h-full min-w-[82%] snap-start sm:min-w-0">
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="aspect-[16/7] overflow-hidden border-b border-border bg-surface">
          <AdvertisementImage advertisement={advertisement} className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]" />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="text-xs font-semibold text-primary">광고 · PREMIUM</p>
          <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-snug">{advertisement.title}</h3>
          <AdvertisementDetails advertisement={advertisement} compact />
          <p className="mt-3 text-sm text-muted-foreground">{advertisement.companyName}</p>
          <span className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-primary">상세 조건 보기 <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
