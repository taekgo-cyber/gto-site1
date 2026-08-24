import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { listAiContentSourceOptions } from "@/lib/blog/ai/source";
import { AI_CONTENT_SOURCE_TYPES, type AiContentSourceType } from "@/lib/blog/ai/types";
import { generateAiBlogDraftAction } from "./actions";

export const metadata: Metadata = { title: "AI 블로그 초안 - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SearchParams = { sourceType?: string; error?: string };
const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const labels: Record<AiContentSourceType, string> = {
  LEASE_POST: "공개 Lease 매물(구조화 필드)",
  REGION: "지역 마스터",
  TONNAGE: "톤수 마스터",
  VEHICLE_TYPE: "차량종류 마스터",
  COMPANY_PUBLIC: "ACTIVE 업체(회사명/지역만)",
  CBT_CATEGORY: "공개 CBT 카테고리",
  BLOG_ARTICLE: "기존 공개 Blog",
};

function parseType(value?: string): AiContentSourceType {
  return value && (AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(value)
    ? value as AiContentSourceType
    : "LEASE_POST";
}

export default async function AdminBlogAiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole("ADMIN");
  void user;
  const query = await searchParams;
  const selectedType = parseType(query.sourceType);
  const options = await listAiContentSourceOptions(selectedType);

  return (
    <Container className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">SITE DATA → AI → DRAFT → ADMIN REVIEW → PUBLISH</p>
          <h1 className="text-2xl font-bold">AI 블로그 초안 생성</h1>
        </div>
        <Link href="/admin/blog" className="text-sm font-medium underline underline-offset-4">블로그 CMS로</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Source 종류 선택</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-72 space-y-1 text-sm"><span>Source</span><select name="sourceType" defaultValue={selectedType} className={inputClass}>{AI_CONTENT_SOURCE_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
            <Button type="submit" variant="outline">데이터 불러오기</Button>
          </form>
        </CardContent>
      </Card>

      {query.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{query.error}</p> : null}

      <Card>
        <CardHeader><CardTitle>2. 생성 요청</CardTitle></CardHeader>
        <CardContent>
          <form action={generateAiBlogDraftAction} className="space-y-5">
            <input type="hidden" name="sourceType" value={selectedType} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span>주제</span><input name="topic" required maxLength={200} className={inputClass} placeholder="예: 5톤 화물차 지입 준비 체크포인트" /></label>
              <label className="space-y-1 text-sm"><span>목표 키워드</span><input name="targetKeyword" required maxLength={120} className={inputClass} placeholder="예: 5ton-cargo-guide" /></label>
            </div>
            <label className="block space-y-1 text-sm"><span>추가 지시 (선택)</span><textarea name="instruction" maxLength={2000} rows={4} className={textareaClass} placeholder="톤, 독자, 반드시 다룰 항목 등" /></label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">사이트 데이터 선택 (최대 20개)</legend>
              <p className="text-xs text-muted-foreground">개인 연락처·CandidateLead·매칭/Unlock·Credit·광고 분석 데이터는 source 후보에 포함되지 않습니다.</p>
              {options.length === 0 ? <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">현재 선택 가능한 공개 데이터가 없습니다.</p> : (
                <div className="grid gap-2 md:grid-cols-2">
                  {options.map((option) => (
                    <label key={option.id} className="flex gap-3 rounded-md border border-border p-3 text-sm">
                      <input type="checkbox" name="sourceIds" value={option.id} className="mt-1" />
                      <span><span className="block font-medium">{option.label}</span>{option.detail ? <span className="text-xs text-muted-foreground">{option.detail}</span> : null}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
              AI 결과는 자동 공개되지 않습니다. 필수 품질검사를 통과한 결과도 <strong>DRAFT</strong>로만 저장되며, 관리자 미리보기·직접 수정 후 기존 발행 버튼으로만 공개됩니다.
            </div>
            <Button type="submit" disabled={options.length === 0}>AI DRAFT 생성</Button>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}
