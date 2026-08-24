import { safeMarkdownHref } from "@/components/blog/MarkdownArticle";
import { prisma } from "@/lib/prisma";
import { redactSensitiveText } from "./source";
import type { AiContentSource, AiQualityIssue, AiQualityReport, GeneratedBlogDraft } from "./types";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?<!\d)(?:01[016789]|0\d{1,2})[- .]?\d{3,4}[- .]?\d{4}(?!\d)/;
const RAW_HTML_RE = /<\s*\/?\s*[a-z][^>]*>/i;
const EXPLICIT_PERSON_NAME_RE = /(?:담당자|대표자|성명|이름)\s*[:：]?\s*[가-힣]{2,4}/;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const NUMBER_RE = /(?<![\p{L}\p{N}])\d[\d,.]*(?:%|kg|톤|원|만원|km|시간|년|월|일)?(?![\p{L}\p{N}])/gu;

function sourceText(sources: AiContentSource[]): string {
  return sources.flatMap((source) => [source.label, ...source.facts]).join("\n");
}

function normalizedNumbers(text: string): Set<string> {
  return new Set((text.match(NUMBER_RE) ?? []).map((value) => value.replace(/[,.]/g, "")));
}

export function inspectGeneratedDraftStatic(draft: GeneratedBlogDraft, sources: AiContentSource[]): AiQualityIssue[] {
  const issues: AiQualityIssue[] = [];
  const combined = `${draft.title}\n${draft.excerpt}\n${draft.contentMarkdown}\n${draft.seoTitle ?? ""}\n${draft.seoDescription ?? ""}\n${draft.tags.join("\n")}`;

  if (!draft.title.trim()) issues.push({ code: "MISSING_TITLE", severity: "ERROR", message: "제목이 없습니다." });
  if (!draft.contentMarkdown.trim()) issues.push({ code: "MISSING_BODY", severity: "ERROR", message: "본문이 없습니다." });
  if (draft.contentMarkdown.trim().length < 300) issues.push({ code: "BODY_TOO_SHORT", severity: "WARNING", message: "본문이 300자 미만입니다." });
  if (EMAIL_RE.test(combined)) issues.push({ code: "PII_EMAIL", severity: "ERROR", message: "이메일 형태의 개인정보가 감지되었습니다." });
  if (PHONE_RE.test(combined)) issues.push({ code: "PII_PHONE", severity: "ERROR", message: "전화번호 형태의 개인정보가 감지되었습니다." });
  if (EXPLICIT_PERSON_NAME_RE.test(combined)) issues.push({ code: "PII_PERSON_NAME", severity: "ERROR", message: "명시적 개인 이름 형태가 감지되었습니다." });
  if (RAW_HTML_RE.test(draft.contentMarkdown)) issues.push({ code: "RAW_HTML", severity: "ERROR", message: "raw HTML이 포함되어 있습니다." });

  for (const match of draft.contentMarkdown.matchAll(MARKDOWN_LINK_RE)) {
    if (!safeMarkdownHref(match[1])) {
      issues.push({ code: "INVALID_URL", severity: "ERROR", message: `허용되지 않는 Markdown URL이 있습니다: ${match[1].slice(0, 80)}` });
      break;
    }
  }

  const sourceNumbers = normalizedNumbers(sourceText(sources));
  const generatedNumbers = normalizedNumbers([
    draft.title,
    draft.excerpt,
    draft.contentMarkdown,
    draft.seoTitle ?? "",
    draft.seoDescription ?? "",
    ...draft.tags,
  ].join("\n"));
  const unsupported = [...generatedNumbers].filter((value) => !sourceNumbers.has(value));
  if (unsupported.length > 0) {
    issues.push({
      code: "UNSOURCED_NUMBER",
      severity: "WARNING",
      message: `원본 source에서 확인되지 않는 수치가 있습니다: ${unsupported.slice(0, 5).join(", ")}`,
    });
  }

  return issues;
}

export async function inspectGeneratedDraft(
  draft: GeneratedBlogDraft,
  sources: AiContentSource[],
): Promise<AiQualityReport> {
  const issues = inspectGeneratedDraftStatic(draft, sources);
  const [slugDuplicate, titleDuplicate] = await Promise.all([
    prisma.blogArticle.findUnique({ where: { slug: draft.slug }, select: { id: true } }),
    prisma.blogArticle.findFirst({ where: { title: draft.title }, select: { id: true } }),
  ]);
  if (slugDuplicate) issues.push({ code: "DUPLICATE_SLUG", severity: "ERROR", message: "이미 사용 중인 slug입니다." });
  if (titleDuplicate) issues.push({ code: "DUPLICATE_TITLE", severity: "WARNING", message: "동일한 제목의 기존 글이 있습니다." });
  return { ok: !issues.some((issue) => issue.severity === "ERROR"), issues };
}

export function safeQualityText(value: string): string {
  return redactSensitiveText(value).slice(0, 500);
}

export function readStoredAiQualityIssues(meta: unknown): AiQualityIssue[] {
  if (!meta || typeof meta !== "object") return [];
  const quality = (meta as { quality?: unknown }).quality;
  if (!quality || typeof quality !== "object") return [];
  const issues = (quality as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter((issue): issue is AiQualityIssue => {
    if (!issue || typeof issue !== "object") return false;
    const row = issue as Partial<AiQualityIssue>;
    return typeof row.code === "string" && (row.severity === "ERROR" || row.severity === "WARNING") && typeof row.message === "string";
  }).slice(0, 20).map((issue) => ({
    code: issue.code.slice(0, 80),
    severity: issue.severity,
    message: issue.message.slice(0, 500),
  }));
}
