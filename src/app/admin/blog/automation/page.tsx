import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { listAiContentSourceOptions } from "@/lib/blog/ai/source";
import { AI_CONTENT_SOURCE_TYPES, type AiContentSourceType } from "@/lib/blog/ai/types";
import { getBlogAutomationOverview } from "@/lib/blog/automation";
import { cancelBlogContentJobAction, enqueueBlogContentJobAction, retryBlogContentJobAction, runDueBlogContentJobsAction, updateBlogAutomationControlAction } from "./actions";

export const metadata: Metadata = { title: "Blog 자동화 - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function kstLocalValue(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function parseSourceType(value?: string): AiContentSourceType {
  return value && (AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(value) ? value as AiContentSourceType : "LEASE_POST";
}

export default async function AdminBlogAutomationPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string; sourceType?: string }> }) {
  const [query, user] = await Promise.all([searchParams, requireRole("ADMIN")]);
  const selectedType = parseSourceType(query.sourceType);
  const [data, sourceOptions] = await Promise.all([getBlogAutomationOverview(user.id), listAiContentSourceOptions(selectedType)]);
  return (
    <Container className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">QUEUE → AI → DRAFT → ADMIN REVIEW → PUBLISH</p><h1 className="text-2xl font-bold">Blog 콘텐츠 자동화</h1></div>
        <Link href="/admin/blog" className="text-sm font-medium underline underline-offset-4">Blog CMS로</Link>
      </div>
      {query.message ? <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{query.message}</p> : null}
      {query.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{query.error}</p> : null}

      <Card>
        <CardHeader><CardTitle>운영 제어</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form action={updateBlogAutomationControlAction} className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm"><span>상태</span><select name="isPaused" defaultValue={String(data.control.isPaused)} className={inputClass}><option value="false">실행 가능</option><option value="true">일시정지</option></select></label>
            <label className="space-y-1 text-sm"><span>일일 AI 생성 한도</span><input name="dailyLimit" type="number" min="1" max="100" defaultValue={data.control.dailyLimit} className={inputClass} /></label>
            <Button type="submit" variant="outline">설정 저장</Button>
          </form>
          <form action={runDueBlogContentJobsAction}><Button type="submit" disabled={data.control.isPaused}>대기 작업 1건 수동 실행</Button></form>
          <p className="text-xs text-muted-foreground">자동화는 AI DRAFT만 만듭니다. 공개는 글 편집 화면에서 관리자 검수 후 직접 또는 예약 발행해야 합니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>생성 작업 예약</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm"><span>Source 종류</span><select name="sourceType" defaultValue={selectedType} className={inputClass}>{AI_CONTENT_SOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <Button type="submit" variant="outline">공개 데이터 불러오기</Button>
          </form>
          <form action={enqueueBlogContentJobAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="idempotencyKey" value={`admin:${randomUUID()}`} />
            <input type="hidden" name="sourceType" value={selectedType} />
            <label className="space-y-1 text-sm"><span>주제</span><input name="topic" required maxLength={200} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>목표 키워드</span><input name="targetKeyword" required maxLength={120} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>예약 시각 (KST)</span><input name="scheduledFor" type="datetime-local" required defaultValue={kstLocalValue(new Date())} className={inputClass} /></label>
            <fieldset className="space-y-2 md:col-span-2"><legend className="text-sm font-medium">공개 Source 선택 (최대 20개)</legend><div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">{sourceOptions.map((option) => <label key={option.id} className="flex gap-2 rounded-md border border-border p-3 text-sm"><input type="checkbox" name="sourceIds" value={option.id} /><span><span className="block font-medium">{option.label}</span>{option.detail ? <span className="text-xs text-muted-foreground">{option.detail}</span> : null}</span></label>)}</div>{sourceOptions.length === 0 ? <p className="text-sm text-muted-foreground">선택 가능한 공개 데이터가 없습니다.</p> : null}</fieldset>
            <label className="space-y-1 text-sm md:col-span-2"><span>추가 지시</span><textarea name="instruction" maxLength={2000} rows={3} className={textareaClass} /></label>
            <div className="md:col-span-2"><Button type="submit" disabled={sourceOptions.length === 0}>대기열 등록</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>최근 작업</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.jobs.length === 0 ? <p className="text-sm text-muted-foreground">등록된 작업이 없습니다.</p> : data.jobs.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <div><p className="font-medium">{job.topic}</p><p className="text-xs text-muted-foreground">{job.status} · {job.sourceType} · 시도 {job.attemptCount}/{job.maxAttempts} · {job.scheduledFor.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{job.lastErrorCode ? ` · ${job.lastErrorCode}` : ""}</p></div>
              <div className="flex flex-wrap gap-2">
                {job.article ? <Link href={`/admin/blog/${job.article.id}/edit`} className="self-center font-medium underline underline-offset-4">DRAFT 검수</Link> : null}
                {(job.status === "FAILED" || job.status === "CANCELLED") ? <form action={retryBlogContentJobAction}><input type="hidden" name="jobId" value={job.id} /><Button type="submit" size="sm" variant="outline">재시도</Button></form> : null}
                {(job.status === "QUEUED" || job.status === "RUNNING") ? <form action={cancelBlogContentJobAction}><input type="hidden" name="jobId" value={job.id} /><Button type="submit" size="sm" variant="outline">취소</Button></form> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </Container>
  );
}
