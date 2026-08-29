import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownArticle } from "@/components/blog/MarkdownArticle";

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownArticle, { markdown }));
}

describe("Blog body Markdown image support", () => {
  it("renders valid https image block with figure/img, alt, lazy and responsive classes", () => {
    const html = render("![화물차 이미지](https://example.com/truck.webp)");
    expect(html).toContain("<figure");
    expect(html).toContain('src="https://example.com/truck.webp"');
    expect(html).toContain('alt="화물차 이미지"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("max-w-full");
    expect(html).toContain("w-full");
  });

  it("renders valid http image block", () => {
    const html = render("![트럭](http://example.com/truck.jpg)");
    expect(html).toContain('src="http://example.com/truck.jpg"');
    expect(html).toContain('alt="트럭"');
    expect(html).toContain("<figure");
  });

  it("blocks javascript URL and renders as escaped paragraph text", () => {
    const html = render("![xss](javascript:alert(1))");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain("![xss](javascript:alert(1))");
  });

  it("blocks data URL", () => {
    const html = render("![xss](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain('src="data:');
  });

  it("blocks file URL", () => {
    const html = render("![xss](file:///etc/passwd)");
    expect(html).not.toContain("<figure");
  });

  it("requires non-empty alt", () => {
    const empty = render("![](https://example.com/a.jpg)");
    expect(empty).not.toContain("<figure");
    const spaces = render("![   ](https://example.com/a.jpg)");
    expect(spaces).not.toContain("<figure");
  });

  it("escapes raw HTML img like existing renderer", () => {
    const html = render('<img src="https://example.com/x.jpg" alt="x">');
    expect(html).not.toContain('<img src="https://example.com/x.jpg"');
    expect(html).toContain("&lt;img");
  });

  it("does not expand inline image parser and keeps it as paragraph text", () => {
    const html = render("문단 앞에 ![인라인](https://example.com/inline.jpg) 뒤에 텍스트");
    expect(html).not.toContain("<figure");
    expect(html).toContain("![인라인](https://example.com/inline.jpg)");
  });

  it("preserves existing Markdown link regression", () => {
    const html = render("[safe](https://example.com/guide)\n\n[bad](javascript:alert(1))");
    expect(html).toContain('href="https://example.com/guide"');
    expect(html).toContain("[bad](javascript:alert(1))");
    expect(html).not.toContain('href="javascript:');
  });

  it("preserves heading/list/paragraph rendering", () => {
    const html = render("# 제목\n\n본문 단락\n\n- 항목 1\n- 항목 2\n\n> 인용");
    expect(html).toContain("<h2");
    expect(html).toContain("제목");
    expect(html).toContain("<p");
    expect(html).toContain("본문 단락");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("<blockquote");
  });

  it("renders image between paragraphs without breaking surrounding blocks", () => {
    const html = render("첫 단락\n\n![중간 이미지](https://example.com/mid.jpg)\n\n둘째 단락");
    expect(html).toContain("첫 단락");
    expect(html).toContain("둘째 단락");
    expect(html).toContain('src="https://example.com/mid.jpg"');
    const figureIndex = html.indexOf("<figure");
    const firstP = html.indexOf("첫 단락");
    const secondP = html.indexOf("둘째 단락");
    expect(figureIndex).toBeGreaterThan(firstP);
    expect(figureIndex).toBeLessThan(secondP);
  });
});
