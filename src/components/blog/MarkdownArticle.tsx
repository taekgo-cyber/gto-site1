import type { ReactNode } from "react";

export function safeMarkdownHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) {
    if (href.startsWith("//") || href.includes("\\")) return null;
    try {
      const origin = "https://local.invalid";
      const url = new URL(href, origin);
      return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function inlineNodes(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token);
      const href = link ? safeMarkdownHref(link[2]) : null;
      if (link && href) {
        const external = /^https?:/i.test(href);
        tokens.push(
          <a
            key={key++}
            href={href}
            className="font-medium text-foreground underline underline-offset-4"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {link[1]}
          </a>,
        );
      } else {
        tokens.push(token);
      }
    } else if (token.startsWith("**")) {
      tokens.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      tokens.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) tokens.push(text.slice(cursor));
  return tokens;
}

function flushList(items: string[], ordered: boolean, key: string): ReactNode | null {
  if (items.length === 0) return null;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <ListTag key={key} className={ordered ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6"}>
      {items.map((item, index) => (
        <li key={`${key}-${index}`}>{inlineNodes(item)}</li>
      ))}
    </ListTag>
  );
}

export function MarkdownArticle({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;
  let inCodeFence = false;
  let codeLines: string[] = [];
  let blockKey = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blockKey++}`} className="leading-7 text-foreground/90">
        {inlineNodes(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushCurrentList = () => {
    const block = flushList(listItems, orderedList, `list-${blockKey++}`);
    if (block) blocks.push(block);
    listItems = [];
  };

  const flushCode = () => {
    blocks.push(
      <pre key={`code-${blockKey++}`} className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-6">
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trimStart().startsWith("```")) {
      flushParagraph();
      flushCurrentList();
      if (inCodeFence) flushCode();
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushCurrentList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushCurrentList();
      const level = heading[1].length;
      if (level === 1) blocks.push(<h2 key={`h-${blockKey++}`} className="text-2xl font-bold">{inlineNodes(heading[2])}</h2>);
      else if (level === 2) blocks.push(<h3 key={`h-${blockKey++}`} className="text-xl font-semibold">{inlineNodes(heading[2])}</h3>);
      else blocks.push(<h4 key={`h-${blockKey++}`} className="text-lg font-semibold">{inlineNodes(heading[2])}</h4>);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushCurrentList();
      blocks.push(<hr key={`hr-${blockKey++}`} className="border-border" />);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = Boolean(ordered);
      if (listItems.length > 0 && orderedList !== nextOrdered) flushCurrentList();
      orderedList = nextOrdered;
      listItems.push((ordered ?? unordered)![1]);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushCurrentList();
      blocks.push(
        <blockquote key={`quote-${blockKey++}`} className="border-l-4 border-border pl-4 text-muted-foreground">
          {inlineNodes(quote[1])}
        </blockquote>,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushCurrentList();
  if (inCodeFence && codeLines.length > 0) flushCode();

  return <article className="space-y-5">{blocks}</article>;
}
