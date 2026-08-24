import { prisma } from "@/lib/prisma";
import {
  AI_CONTENT_SOURCE_TYPES,
  type AiContentGenerationRequest,
  type AiContentSource,
  type AiContentSourceType,
  type AiSourceOption,
} from "./types";

const MAX_SOURCE_IDS = 20;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:01[016789]|0\d{1,2})[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g;
const LABELED_PERSON_NAME_RE = /((?:담당자|대표자|성명|이름)\s*[:：]?\s*)[가-힣]{2,4}/g;

export function redactSensitiveText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(EMAIL_RE, "[email-redacted]")
    .replace(PHONE_RE, "[phone-redacted]")
    .replace(LABELED_PERSON_NAME_RE, "$1[name-redacted]");
}

export function validateAiContentGenerationRequest(request: AiContentGenerationRequest): AiContentGenerationRequest {
  if (typeof request.topic !== "string" || typeof request.targetKeyword !== "string") {
    throw new Error("BLOG_AI_REQUEST_INVALID");
  }
  if (request.instruction !== undefined && typeof request.instruction !== "string") {
    throw new Error("BLOG_AI_REQUEST_INVALID");
  }
  if (!(AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(request.sourceType) || !Array.isArray(request.sourceIds)) {
    throw new Error("BLOG_AI_SOURCE_TYPE_INVALID");
  }
  if (!request.sourceIds.every((id) => typeof id === "string")) throw new Error("BLOG_AI_SOURCE_IDS_INVALID");
  const topic = request.topic.trim();
  const targetKeyword = request.targetKeyword.trim();
  const instruction = request.instruction?.trim() || undefined;
  const sourceIds = [...new Set(request.sourceIds.map((id) => id.trim()).filter(Boolean))];
  if (topic.length < 2 || topic.length > 200) throw new Error("BLOG_AI_TOPIC_INVALID");
  if (targetKeyword.length < 2 || targetKeyword.length > 120) throw new Error("BLOG_AI_KEYWORD_INVALID");
  if (instruction && instruction.length > 2_000) throw new Error("BLOG_AI_INSTRUCTION_INVALID");
  if (sourceIds.length < 1 || sourceIds.length > MAX_SOURCE_IDS) throw new Error("BLOG_AI_SOURCE_IDS_INVALID");
  if (sourceIds.some((id) => id.length > 191)) throw new Error("BLOG_AI_SOURCE_IDS_INVALID");
  if ([topic, targetKeyword, instruction ?? ""].some((value) => redactSensitiveText(value) !== value)) {
    throw new Error("BLOG_AI_REQUEST_PII_DETECTED");
  }
  return { ...request, topic, targetKeyword, sourceIds, instruction };
}

function assertAllFound(requested: string[], sources: AiContentSource[]): AiContentSource[] {
  if (sources.length !== requested.length) throw new Error("BLOG_AI_SOURCE_NOT_PUBLIC_OR_MISSING");
  const found = new Set(sources.map((source) => source.id));
  if (requested.some((id) => !found.has(id))) throw new Error("BLOG_AI_SOURCE_NOT_PUBLIC_OR_MISSING");
  return requested.map((id) => sources.find((source) => source.id === id)!);
}

export async function loadAiContentSources(rawRequest: AiContentGenerationRequest, now = new Date()): Promise<AiContentSource[]> {
  const request = validateAiContentGenerationRequest(rawRequest);
  const ids = request.sourceIds;

  switch (request.sourceType) {
    case "LEASE_POST": {
      const rows = await prisma.leasePost.findMany({
        where: { id: { in: ids }, status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now, not: null } },
        select: {
          id: true,
          title: true,
          payType: true,
          payAmount: true,
          workType: true,
          region: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true, weightKg: true } },
        },
      });
      return assertAllFound(ids, rows.map((row) => ({
        type: "LEASE_POST" as const,
        id: row.id,
        label: redactSensitiveText(row.title),
        facts: [
          `매물 제목: ${redactSensitiveText(row.title)}`,
          row.region ? `지역: ${row.region.name}` : "",
          row.vehicleType ? `차량종류: ${row.vehicleType.name}` : "",
          row.tonnage ? `톤수: ${row.tonnage.name}${row.tonnage.weightKg ? ` (${row.tonnage.weightKg}kg)` : ""}` : "",
          row.payType ? `급여형태: ${row.payType}` : "",
          row.payAmount != null ? `급여금액: ${row.payAmount}` : "",
          row.workType ? `운행형태: ${row.workType}` : "",
        ].filter(Boolean),
      })));
    }
    case "REGION": {
      const rows = await prisma.region.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, code: true, name: true, depth: true } });
      return assertAllFound(ids, rows.map((row) => ({ type: "REGION" as const, id: row.id, label: row.name, facts: [`지역명: ${row.name}`, `지역코드: ${row.code}`, `지역단계: ${row.depth}`] })));
    }
    case "TONNAGE": {
      const rows = await prisma.tonnage.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, code: true, name: true, weightKg: true } });
      return assertAllFound(ids, rows.map((row) => ({ type: "TONNAGE" as const, id: row.id, label: row.name, facts: [`톤수명: ${row.name}`, `코드: ${row.code}`, row.weightKg ? `기준중량: ${row.weightKg}kg` : ""].filter(Boolean) })));
    }
    case "VEHICLE_TYPE": {
      const rows = await prisma.vehicleType.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, code: true, name: true } });
      return assertAllFound(ids, rows.map((row) => ({ type: "VEHICLE_TYPE" as const, id: row.id, label: row.name, facts: [`차량종류: ${row.name}`, `코드: ${row.code}`] })));
    }
    case "COMPANY_PUBLIC": {
      const rows = await prisma.company.findMany({
        where: { id: { in: ids }, status: "ACTIVE", deletedAt: null },
        select: { id: true, name: true, region: { select: { name: true } } },
      });
      return assertAllFound(ids, rows.map((row) => ({ type: "COMPANY_PUBLIC" as const, id: row.id, label: row.name, facts: [`업체명: ${row.name}`, row.region ? `지역: ${row.region.name}` : ""].filter(Boolean) })));
    }
    case "CBT_CATEGORY": {
      const rows = await prisma.cbtCategory.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, slug: true, name: true, description: true } });
      return assertAllFound(ids, rows.map((row) => ({ type: "CBT_CATEGORY" as const, id: row.id, label: row.name, facts: [`CBT 카테고리: ${row.name}`, `slug: ${row.slug}`, row.description ? `설명: ${redactSensitiveText(row.description)}` : ""].filter(Boolean) })));
    }
    case "BLOG_ARTICLE": {
      const rows = await prisma.blogArticle.findMany({
        where: { id: { in: ids }, status: "PUBLISHED", publishedAt: { lte: now, not: null } },
        select: { id: true, title: true, excerpt: true, contentMarkdown: true, tags: true, category: { select: { name: true } } },
      });
      return assertAllFound(ids, rows.map((row) => ({
        type: "BLOG_ARTICLE" as const,
        id: row.id,
        label: redactSensitiveText(row.title),
        facts: [
          `기존 글 제목: ${redactSensitiveText(row.title)}`,
          row.category ? `카테고리: ${row.category.name}` : "",
          row.excerpt ? `요약: ${redactSensitiveText(row.excerpt)}` : "",
          `본문 참고: ${redactSensitiveText(row.contentMarkdown).slice(0, 8_000)}`,
        ].filter(Boolean),
      })));
    }
  }
}

export async function listAiContentSourceOptions(type: AiContentSourceType, now = new Date()): Promise<AiSourceOption[]> {
  switch (type) {
    case "LEASE_POST": return prisma.leasePost.findMany({ where: { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now, not: null } }, select: { id: true, title: true }, orderBy: { publishedAt: "desc" }, take: 30 }).then((rows) => rows.map((row) => ({ id: row.id, label: redactSensitiveText(row.title) })));
    case "REGION": return prisma.region.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: [{ depth: "asc" }, { sortOrder: "asc" }], take: 60 }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name, detail: row.code })));
    case "TONNAGE": return prisma.tonnage.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { sortOrder: "asc" }, take: 60 }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name, detail: row.code })));
    case "VEHICLE_TYPE": return prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { sortOrder: "asc" }, take: 60 }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name, detail: row.code })));
    case "COMPANY_PUBLIC": return prisma.company.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 30 }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name })));
    case "CBT_CATEGORY": return prisma.cbtCategory.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true }, orderBy: { sortOrder: "asc" }, take: 30 }).then((rows) => rows.map((row) => ({ id: row.id, label: row.name, detail: row.slug })));
    case "BLOG_ARTICLE": return prisma.blogArticle.findMany({ where: { status: "PUBLISHED", publishedAt: { lte: now, not: null } }, select: { id: true, title: true, slug: true }, orderBy: { publishedAt: "desc" }, take: 30 }).then((rows) => rows.map((row) => ({ id: row.id, label: redactSensitiveText(row.title), detail: row.slug })));
  }
}
