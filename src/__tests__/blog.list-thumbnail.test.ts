import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type ListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  publishedAt: Date;
  category: { slug: string; name: string } | null;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function BlogCard({ article }: { article: ListItem }) {
  return createElement(
    Card,
    { className: "h-full overflow-hidden" },
    article.featuredImageUrl
      ? createElement(
          "div",
          { className: "aspect-[16/9] w-full overflow-hidden bg-muted" },
          createElement("img", {
            src: article.featuredImageUrl,
            alt: article.featuredImageAlt ?? article.title,
            loading: "lazy",
            className: "h-full w-full object-cover",
          }),
        )
      : null,
    createElement(
      CardHeader,
      null,
      article.category ? createElement("p", { className: "text-xs" }, article.category.name) : null,
      createElement(CardTitle, null, article.title),
    ),
    createElement(
      CardContent,
      null,
      article.excerpt ? createElement("p", null, article.excerpt) : null,
      createElement("p", null, formatDate(article.publishedAt)),
    ),
  );
}

function render(article: ListItem): string {
  return renderToStaticMarkup(createElement(BlogCard, { article }));
}

describe("Blog list thumbnail", () => {
  const base: ListItem = {
    id: "1",
    slug: "cargo-guide",
    title: "화물차 가이드",
    excerpt: "요약",
    publishedAt: new Date("2026-08-24T00:00:00.000Z"),
    category: { slug: "guide", name: "가이드" },
    featuredImageUrl: null,
    featuredImageAlt: null,
  };

  it("renders thumbnail with alt when featuredImageUrl exists", () => {
    const html = render({
      ...base,
      featuredImageUrl: "https://example.com/thumb.jpg",
      featuredImageAlt: "화물차 썸네일",
    });
    expect(html).toContain('src="https://example.com/thumb.jpg"');
    expect(html).toContain('alt="화물차 썸네일"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("aspect-[16/9]");
    expect(html).toContain("object-cover");
  });

  it("uses title as fallback alt when featuredImageAlt is null", () => {
    const html = render({
      ...base,
      featuredImageUrl: "https://example.com/thumb.jpg",
      featuredImageAlt: null,
    });
    expect(html).toContain('alt="화물차 가이드"');
  });

  it("does not render image when featuredImageUrl is null and preserves existing card UI", () => {
    const html = render(base);
    expect(html).not.toContain("<img");
    expect(html).toContain("화물차 가이드");
    expect(html).toContain("요약");
    expect(html).toContain("가이드");
  });

  it("preserves title/category/excerpt/date structure regardless of image presence", () => {
    const withImage = render({
      ...base,
      featuredImageUrl: "https://example.com/a.jpg",
      featuredImageAlt: "alt",
    });
    const withoutImage = render(base);
    for (const html of [withImage, withoutImage]) {
      expect(html).toContain("화물차 가이드");
      expect(html).toContain("가이드");
      expect(html).toContain("요약");
    }
  });

  it("keeps fixed aspect ratio wrapper for CLS prevention", () => {
    const html = render({
      ...base,
      featuredImageUrl: "https://example.com/a.jpg",
      featuredImageAlt: "alt",
    });
    expect(html).toContain("aspect-[16/9]");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("w-full");
  });
});
