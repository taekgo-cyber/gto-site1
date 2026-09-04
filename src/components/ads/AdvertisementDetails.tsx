import { formatDate, formatPayAmount, workTypeLabel } from "@/lib/jobs/labels";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function AdvertisementDetails({ advertisement, compact = false }: { advertisement: PublicHomepageAdvertisement; compact?: boolean }) {
  const listing = advertisement.listing;
  if (!listing) return null;
  const route = listing.originRegionName || listing.destRegionName
    ? `${listing.originRegionName ?? "-"} → ${listing.destRegionName ?? "-"}` : listing.regionName;
  return <div className={`home-ad-details${compact ? " is-compact" : ""}`}>
    {route ? <p>{route}</p> : null}
    <p className="home-ad-pay">{listing.payType === "MONTHLY" ? "월 " : listing.payType === "DAILY" ? "일 " : ""}{formatPayAmount(listing.payType, listing.payAmount)}</p>
    <div className="home-ad-tags">{[listing.tonnageName, listing.vehicleTypeName, listing.workType ? workTypeLabel(listing.workType) : null].filter(Boolean).map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div>
    {listing.deadline ? <p className="home-ad-deadline">마감 {formatDate(listing.deadline)}</p> : null}
  </div>;
}
