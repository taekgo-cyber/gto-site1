import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function PremiumAdCard({
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
      className="h-full min-w-[86%] snap-start sm:min-w-[calc((100%-1rem)/2)] xl:min-w-[calc((100%-2.5rem)/3)]"
    >
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[16/8] overflow-hidden border-b border-border bg-surface">
          <AdvertisementImage
            advertisement={advertisement}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]"
          />
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-black tracking-wide text-white shadow">PREMIUM</span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="text-xs font-semibold text-primary">프리미엄 공고 · 광고</p>
          <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-snug tracking-[-0.01em]">{advertisement.title}</h3>
          <AdvertisementDetails advertisement={advertisement} compact />
          <p className="mt-3 text-sm text-muted-foreground">{advertisement.companyName}</p>
          <span className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-bold text-primary">
            상세 조건 보기 <span aria-hidden="true" className="ml-1">→</span>
          </span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
