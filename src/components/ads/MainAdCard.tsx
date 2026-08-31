import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function MainAdCard({ advertisement, eager = false, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; eager?: boolean; trackingEnabled?: boolean }) {
  return (
    <AdViewabilityTracker campaignId={advertisement.id} enabled={trackingEnabled} className="h-full min-w-[88%] snap-start md:min-w-0">
      <a
        href={trackingEnabled ? `/api/ads/${encodeURIComponent(advertisement.id)}/click` : advertisement.linkUrl}
        rel="sponsored noopener noreferrer"
        className="group flex h-full min-h-[29rem] flex-col overflow-hidden rounded-xl border border-primary/25 bg-background shadow-sm transition hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="aspect-[16/8] overflow-hidden border-b border-border bg-surface">
          <AdvertisementImage advertisement={advertisement} eager={eager} className="h-full w-full object-cover transition-transform group-hover:scale-[1.015]" />
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-primary">광고 · MAIN</p>
          <h3 className="mt-3 line-clamp-2 text-xl font-bold leading-snug sm:text-2xl">{advertisement.title}</h3>
          <AdvertisementDetails advertisement={advertisement} />
          <p className="mt-3 text-sm text-muted-foreground">{advertisement.companyName}</p>
          <span className="mt-auto inline-flex min-h-11 items-center pt-5 font-semibold text-primary">상세 조건 보기 <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </AdViewabilityTracker>
  );
}
