import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function CompanyBanner({ advertisement, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean }) {
  return (
    <AdViewabilityTracker campaignId={advertisement.id} enabled={trackingEnabled} className="h-full min-w-[76%] snap-start sm:min-w-72 xl:min-w-0">
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full min-h-56 flex-col overflow-hidden rounded-lg border border-border bg-background transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:min-h-[29rem]"
      >
        <div className="aspect-[16/7] overflow-hidden border-b border-border bg-surface xl:aspect-[4/3]">
          <AdvertisementImage advertisement={advertisement} className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]" />
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="text-[11px] font-semibold text-muted-foreground">광고</p>
          <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug">{advertisement.companyName}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">{advertisement.bannerCopy ?? advertisement.title}</p>
          <span className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-primary">업체 보기 <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
