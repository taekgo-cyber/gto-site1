import { homepageAdTracking } from "@/lib/monetization/homepage-samples";
import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function CompanyBanner({ advertisement, trackingEnabled = true, variant = "vertical" }: {
  advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean; variant?: "vertical" | "horizontal";
}) {
  const tracking = homepageAdTracking(advertisement, trackingEnabled);
  return <AdViewabilityTracker campaignId={advertisement.id} enabled={tracking.enabled} className={`home-company-card home-company-${variant} snap-start`}>
    <a href={tracking.href} data-sample={advertisement.isSample || undefined} rel="sponsored noopener noreferrer">
      <div className="home-company-copy"><h3>{advertisement.companyName}</h3><p>{advertisement.bannerCopy ?? advertisement.title}</p></div>
      <div className="home-company-image"><AdvertisementImage advertisement={advertisement} className="h-full w-full object-cover" /></div>
    </a>
  </AdViewabilityTracker>;
}
