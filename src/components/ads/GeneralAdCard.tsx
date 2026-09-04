import { homepageAdTracking } from "@/lib/monetization/homepage-samples";
import { AdViewabilityTracker } from "./AdViewabilityTracker";
import { formatPayAmount } from "@/lib/jobs/labels";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function GeneralAdCard({ advertisement, trackingEnabled = true }: { advertisement: PublicHomepageAdvertisement; trackingEnabled?: boolean }) {
  const listing = advertisement.listing;
  const tracking = homepageAdTracking(advertisement, trackingEnabled);
  return <AdViewabilityTracker campaignId={advertisement.id} enabled={tracking.enabled}>
    <a href={tracking.href} data-sample={advertisement.isSample || undefined} rel="sponsored noopener noreferrer" className="home-general-card">
      <span className="sr-only">GENERAL · 스폰서 </span><h3>{advertisement.title}</h3>
      <span>{listing ? [listing.originRegionName ?? listing.regionName, listing.destRegionName].filter(Boolean).join(" → ") : advertisement.companyName}</span>
      {listing ? <strong>{formatPayAmount(listing.payType, listing.payAmount)}</strong> : null}
      <small>{advertisement.sampleListingType ?? (advertisement.leasePostId ? "지입" : "구인")} · {advertisement.companyName}</small>
    </a>
  </AdViewabilityTracker>;
}
