import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function CompanyBanner({
  advertisement,
  trackingEnabled = true,
}: {
  advertisement: PublicHomepageAdvertisement;
  trackingEnabled?: boolean;
}) {
  return (
    <AdViewabilityTracker
      campaignId={advertisement.id}
      enabled={trackingEnabled}
      className="h-full min-w-[86%] snap-start sm:min-w-0"
    >
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full min-h-44 overflow-hidden rounded-xl border border-border bg-background shadow-sm transition hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="hidden w-[36%] shrink-0 overflow-hidden border-r border-border bg-surface sm:block">
          <AdvertisementImage
            advertisement={advertisement}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-5">
          <p className="text-xs font-bold text-primary">MONTHLY COMPANY · 광고</p>
          <h3 className="mt-2 line-clamp-1 text-xl font-bold leading-snug">{advertisement.companyName}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {advertisement.bannerCopy ?? advertisement.title}
          </p>
          <span className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-bold text-primary">
            기업 정보 보기 <span aria-hidden="true" className="ml-1">→</span>
          </span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
