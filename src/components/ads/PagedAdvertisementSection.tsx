"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createAdvertisementPager } from "@/lib/monetization/homepage-pages";

export function PagedAdvertisementSection({ id, tier, heading, pages }: {
  id: string; tier: string; heading: ReactNode; pages: ReactNode[];
}) {
  const [page, setPage] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const currentPage = page < pages.length ? page : 0;
  const controller = useRef<ReturnType<typeof createAdvertisementPager> | null>(null);
  useEffect(() => {
    const pager = createAdvertisementPager(pages.length, setPage);
    controller.current = pager;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => { pager.pause("motion", media.matches); setReducedMotion(media.matches); };
    const visibility = () => pager.pause("hidden", document.hidden);
    motion(); visibility(); pager.start();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => { pager.dispose(); media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, [pages.length]);
  return <section className={`home-panel home-paged-section home-${tier.toLowerCase()}-section`} aria-labelledby={id} aria-roledescription="carousel" data-tier={tier} data-page-index={currentPage}
    onMouseEnter={() => controller.current?.pause("hover", true)} onMouseLeave={() => controller.current?.pause("hover", false)}
    onFocusCapture={() => controller.current?.pause("focus", true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) controller.current?.pause("focus", false); }}>
    {heading}
    {pages.length > 1 && <div className="home-page-controls" aria-label={`${tier} 페이지 탐색`}>
      <button type="button" aria-label={`${tier} 이전 페이지`} onClick={() => controller.current?.move(-1)}>‹</button>
      <span aria-label={`${tier} 현재 페이지`}>{currentPage + 1} / {pages.length}</span>
      <button type="button" aria-label={`${tier} 다음 페이지`} onClick={() => controller.current?.move(1)}>›</button>
      <button type="button" disabled={reducedMotion} aria-pressed={stopped || reducedMotion} onClick={() => { const next = !stopped; setStopped(next); controller.current?.pause("user", next); }}>{reducedMotion ? "자동순환 꺼짐" : stopped ? "자동순환 재생" : "자동순환 정지"}</button>
    </div>}
    {pages.map((content, index) => <div key={index} className="home-ad-page" hidden={index !== currentPage} role="group" aria-label={`${tier} 페이지 ${index + 1} / ${pages.length}`}>{content}</div>)}
  </section>;
}
