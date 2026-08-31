import type { ReactNode } from "react";
import { Container } from "@/components/common/Container";
import { AdViewabilityTracker } from "@/components/ads/AdViewabilityTracker";
import type { PaidRecruitmentTier } from "@/lib/monetization/policy";

export type PublicAd = {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  companyName: string | null;
  recruitmentTier: PaidRecruitmentTier;
};

const TIER_LABELS: Record<PaidRecruitmentTier, string> = {
  MAIN: "메인 광고",
  PREMIUM: "프리미엄",
  GENERAL: "일반 광고",
};

function TrackedAdLink({ campaign, className, children }: {
  campaign: PublicAd;
  className: string;
  children: ReactNode;
}) {
  if (!campaign.linkUrl) return <AdViewabilityTracker campaignId={campaign.id}><div className={className}>{children}</div></AdViewabilityTracker>;

  return (
    <AdViewabilityTracker campaignId={campaign.id} className="h-full">
      <a
        href={`/api/ads/${encodeURIComponent(campaign.id)}/click`}
        rel="sponsored noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    </AdViewabilityTracker>
  );
}

function MainAdvertisement({ campaign }: { campaign: PublicAd }) {
  return (
    <TrackedAdLink
      campaign={campaign}
      className="group flex min-h-64 flex-col overflow-hidden rounded-xl border border-primary/25 bg-background shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-72 sm:flex-row"
    >
      <div className="relative aspect-[16/8] shrink-0 overflow-hidden bg-primary/5 sm:aspect-auto sm:w-[42%]">
        {campaign.imageUrl ? (
          // Advertisement images are admin-approved HTTPS or internal URLs and may use arbitrary hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full min-h-36 items-center justify-center px-6 text-center text-sm font-semibold text-primary">
            {campaign.companyName ?? "운전픽 추천 기업"}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {TIER_LABELS[campaign.recruitmentTier]}
          </span>
          <span className="text-xs font-medium text-muted-foreground">우선 노출</span>
        </div>
        <h3 className="mt-4 text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {campaign.title}
        </h3>
        {campaign.companyName ? (
          <p className="mt-2 text-sm text-muted-foreground">{campaign.companyName}</p>
        ) : null}
        <span className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary">
          광고 자세히 보기 <span aria-hidden="true">→</span>
        </span>
      </div>
    </TrackedAdLink>
  );
}

function SideAdvertisement({ campaign, position }: {
  campaign: PublicAd;
  position: "left" | "right";
}) {
  return (
    <aside
      aria-label={`${position === "left" ? "왼쪽" : "오른쪽"} 기업 광고`}
      className="min-w-0"
    >
      <TrackedAdLink
        campaign={campaign}
        className="group flex h-full min-h-44 flex-col overflow-hidden rounded-xl border border-border bg-background transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-72"
      >
        <div className="relative aspect-[16/7] overflow-hidden bg-surface lg:aspect-[4/3]">
          {campaign.imageUrl ? (
            // Advertisement images are admin-approved HTTPS or internal URLs and may use arbitrary hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-muted-foreground">
              {campaign.companyName ?? "기업 광고"}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <span className="text-[11px] font-semibold text-primary">
            {TIER_LABELS[campaign.recruitmentTier]}
          </span>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug">
            {campaign.title}
          </h3>
          {campaign.companyName ? (
            <p className="mt-auto pt-3 text-xs text-muted-foreground">
              {campaign.companyName}
            </p>
          ) : null}
        </div>
      </TrackedAdLink>
    </aside>
  );
}

export function AdPlacementSlot({ campaigns }: { campaigns: PublicAd[] }) {
  if (campaigns.length === 0) return null;

  const [mainCampaign, leftCampaign, rightCampaign] = campaigns;

  return (
    <section aria-labelledby="featured-advertisements" className="border-b border-border bg-surface">
      <Container className="py-8 sm:py-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Sponsored</p>
            <h2 id="featured-advertisements" className="mt-1 text-xl font-bold sm:text-2xl">
              주목할 운송·채용 광고
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">광고 상품 등급과 운영 정책에 따라 노출됩니다.</p>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_13rem]">
          <div className="order-2 lg:order-1">
            {leftCampaign ? <SideAdvertisement campaign={leftCampaign} position="left" /> : null}
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <MainAdvertisement campaign={mainCampaign} />
          </div>
          <div className="order-3 lg:order-3">
            {rightCampaign ? <SideAdvertisement campaign={rightCampaign} position="right" /> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
