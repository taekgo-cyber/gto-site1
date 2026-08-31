import { formatDate, formatPayAmount, workTypeLabel } from "@/lib/jobs/labels";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function AdvertisementDetails({
  advertisement,
  compact = false,
}: {
  advertisement: PublicHomepageAdvertisement;
  compact?: boolean;
}) {
  const listing = advertisement.listing;
  if (!listing) return null;
  const route = listing.originRegionName || listing.destRegionName
    ? `${listing.originRegionName ?? "-"} → ${listing.destRegionName ?? "-"}`
    : listing.regionName;
  const vehicle = [listing.vehicleTypeName, listing.tonnageName].filter(Boolean).join(" · ");
  const workType = listing.workType ? workTypeLabel(listing.workType) : null;
  return (
    <>
      <p className={compact ? "mt-2 text-base font-bold text-foreground" : "mt-3 text-xl font-bold text-foreground"}>
        {formatPayAmount(listing.payType, listing.payAmount)}
      </p>
      <dl className={`mt-3 grid gap-x-4 gap-y-2 text-sm ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {route ? <div><dt className="sr-only">지역 또는 노선</dt><dd className="font-medium text-foreground">{route}</dd></div> : null}
        {vehicle ? <div><dt className="sr-only">차종 및 톤수</dt><dd className="text-muted-foreground">{vehicle}</dd></div> : null}
        {workType ? <div><dt className="sr-only">근무 형태</dt><dd className="text-muted-foreground">{workType}</dd></div> : null}
        {listing.deadline ? <div><dt className="sr-only">마감</dt><dd className="text-muted-foreground">마감 {formatDate(listing.deadline)}</dd></div> : null}
      </dl>
    </>
  );
}
