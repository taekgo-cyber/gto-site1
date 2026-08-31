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
      <div className={`${className} flex items-center justify-center bg-primary/5 px-5 text-center text-sm font-semibold text-primary`}>
        {advertisement.companyName}
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
