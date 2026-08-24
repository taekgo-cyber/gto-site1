import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownArticle } from "@/components/blog/MarkdownArticle";

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownArticle, { markdown }));
}

describe("Session 16 Gate 3 admin preview renderer", () => {
  it("renders raw HTML as escaped text instead of executable markup", () => {
    const html = render('<script>alert("xss")</script>\n\n<strong>raw html</strong>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<strong>raw html</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;strong&gt;");
  });

  it("drops unsafe markdown link protocols while preserving safe internal and https links", () => {
    const html = render('[bad](javascript:alert(1))\n\n[internal](/jobs)\n\n[safe](https://example.com/guide)');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('[bad](javascript:alert(1))');
    expect(html).toContain('href="/jobs"');
    expect(html).toContain('href="https://example.com/guide"');
  });

  it("renders supported markdown structures as React elements", () => {
    const html = render('# 제목\n\n**굵게**와 `코드`\n\n- 항목 1\n- 항목 2\n\n> 인용');
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>굵게</strong>");
    expect(html).toContain(">코드</code>");
    expect(html).toContain("<ul");
    expect(html).toContain("<blockquote");
  });
});
