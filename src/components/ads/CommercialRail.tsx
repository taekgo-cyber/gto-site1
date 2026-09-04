"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function shouldAutoAdvanceCommercialRail({
  hovered,
  focusWithin,
  reducedMotion,
}: {
  hovered: boolean;
  focusWithin: boolean;
  reducedMotion: boolean;
}) {
  return !hovered && !focusWithin && !reducedMotion;
}

export function CommercialRail({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const move = useCallback((direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 2) return;
    const next = direction > 0
      ? rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8 ? 0 : rail.scrollLeft + rail.clientWidth * 0.82
      : rail.scrollLeft <= 8 ? rail.scrollWidth : rail.scrollLeft - rail.clientWidth * 0.82;
    rail.scrollTo({ left: next, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!shouldAutoAdvanceCommercialRail({
      hovered,
      focusWithin,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    })) return;
    const timer = window.setInterval(() => {
      const region = regionRef.current;
      if (region?.matches(":hover") || region?.contains(document.activeElement)) return;
      move(1);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [focusWithin, hovered, move]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const updateOverflow = () => setHasOverflow(rail.scrollWidth > rail.clientWidth + 2);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(rail);
    for (const child of rail.children) observer.observe(child);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="min-w-0 max-w-full overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      {hasOverflow ? (
        <div className="commercial-rail-controls mb-3 flex justify-end gap-2">
          <button type="button" onClick={() => move(-1)} aria-label={`${label} 이전 항목`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-lg font-bold text-foreground shadow-sm transition hover:border-primary/35 hover:text-primary">←</button>
          <button type="button" onClick={() => move(1)} aria-label={`${label} 다음 항목`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-lg font-bold text-foreground shadow-sm transition hover:border-primary/35 hover:text-primary">→</button>
        </div>
      ) : null}
      <div ref={railRef} className={cn("scrollbar-hidden scroll-smooth", className)}>{children}</div>
    </div>
  );
}
