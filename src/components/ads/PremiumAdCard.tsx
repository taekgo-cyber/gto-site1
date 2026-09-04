import { homepageAdTracking } from "@/lib/monetization/homepage-samples";
import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { AdvertisementDetails } from "./AdvertisementDetails";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function PremiumAdCard({ advertisement, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean }) {
  const tracking = homepageAdTracking(advertisement, trackingEnabled);
  return <AdViewabilityTracker campaignId={advertisement.id} enabled={tracking.enabled} className="home-premium-card snap-start">
    <a href={tracking.href} data-sample={advertisement.isSample || undefined} rel="sponsored noopener noreferrer" className="home-ad-card">
      <div className="home-ad-image"><AdvertisementImage advertisement={advertisement} className="h-full w-full object-cover" /><span className="home-ad-badge">PREMIUM</span></div>
      <div className="home-ad-body"><h3>{advertisement.title}</h3><AdvertisementDetails advertisement={advertisement} compact /><p className="home-ad-company">{advertisement.companyName}</p></div>
    </a>
  </AdViewabilityTracker>;
}
