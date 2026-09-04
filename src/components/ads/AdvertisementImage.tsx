"use client";

import { useState } from "react";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function AdvertisementImage({
  advertisement,
  eager = false,
  className,
}: {
  advertisement: PublicHomepageAdvertisement;
  eager?: boolean;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!advertisement.imageUrl || failed) {
    return (
      <div className={`${className} home-ad-image-fallback`}>
        <span>{advertisement.companyName}</span>
        <small>운송 참고 이미지</small>
      </div>
    );
  }
  return (
    <div className={`${className} relative bg-primary/5`}>
      <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm font-semibold text-primary">
        {advertisement.companyName}
      </div>
      {/* The creative is decorative because the adjacent card repeats company and listing text. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={advertisement.imageUrl}
        style={{ objectPosition: advertisement.imagePosition }}
        alt=""
        width={720}
        height={405}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onError={() => setFailed(true)}
        className="relative h-full w-full object-cover"
      />
    </div>
  );
}
