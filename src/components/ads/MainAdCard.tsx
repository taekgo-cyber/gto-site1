import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function MainAdCard({
  advertisement,
  eager = false,
  trackingEnabled = true,
}: {
  advertisement: PublicHomepageAdvertisement;
  eager?: boolean;
  trackingEnabled?: boolean;
}) {
  return (
    <AdViewabilityTracker
      campaignId={advertisement.id}
      enabled={trackingEnabled}
      className="h-full min-w-[91%] snap-start md:min-w-full"
    >
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full min-h-[25rem] flex-col overflow-hidden rounded-2xl border border-primary/30 bg-background shadow-[0_14px_34px_rgba(15,45,85,0.1)] transition hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-[0_18px_40px_rgba(15,45,85,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[16/7.5] overflow-hidden border-b border-border bg-surface">
          <AdvertisementImage
            advertisement={advertisement}
            eager={eager}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]"
          />
          <span className="absolute left-4 top-4 rounded-full bg-brand-deep px-3 py-1.5 text-xs font-black tracking-[0.08em] text-white shadow-lg">MAIN</span>
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-primary">주요 공고 · 광고</p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{advertisement.companyName}</p>
          </div>
          <h3 className="mt-2 line-clamp-2 text-xl font-black leading-snug tracking-[-0.02em] sm:text-[23px]">{advertisement.title}</h3>
          <AdvertisementDetails advertisement={advertisement} />
          <span className="mt-auto inline-flex min-h-11 items-center pt-4 font-bold text-primary">
            상세 조건 보기 <span aria-hidden="true" className="ml-1">→</span>
          </span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
