"use client";

import { useState } from "react";
import type { PublicBlogArticleListItem } from "@/lib/blog/types";

export function HomeEditorialImage({ article }: { article: PublicBlogArticleListItem }) {
  const [failed, setFailed] = useState(false);
  let src = article.featuredImageUrl;
  if (src) {
    try {
      const url = new URL(src);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") src = `${url.pathname}${url.search}`;
    } catch { /* Relative CMS image URLs are already usable. */ }
  }
  if (!src || failed) return <div className="home-editorial-fallback"><span>운전픽</span><strong>{article.category?.name ?? "운전·물류 가이드"}</strong></div>;
  // Preserve the CMS's approved image hosts without introducing new remote sources.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={article.featuredImageAlt ?? article.title} width={1200} height={630} loading="lazy" onError={() => setFailed(true)} />;
}
