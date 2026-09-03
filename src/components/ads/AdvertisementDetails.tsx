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
      <p className={compact ? "mt-2 text-lg font-black text-foreground" : "mt-3 text-2xl font-black tracking-[-0.02em] text-primary"}>
        {formatPayAmount(listing.payType, listing.payAmount)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {route ? <div><dt className="text-[13px] font-semibold text-muted-foreground">노선·지역</dt><dd className="mt-0.5 font-medium text-foreground">{route}</dd></div> : null}
        {vehicle ? <div><dt className="text-[13px] font-semibold text-muted-foreground">차종·톤수</dt><dd className="mt-0.5 text-foreground">{vehicle}</dd></div> : null}
        {workType ? <div><dt className="text-[13px] font-semibold text-muted-foreground">근무 형태</dt><dd className="mt-0.5 text-foreground">{workType}</dd></div> : null}
        {listing.deadline ? <div><dt className="text-[13px] font-semibold text-muted-foreground">마감</dt><dd className="mt-0.5 text-foreground">{formatDate(listing.deadline)}</dd></div> : null}
      </dl>
    </>
  );
}
