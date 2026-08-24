import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminBlogOverview } from "@/lib/blog/service";
import {
  createBlogArticleAction,
  createBlogCategoryAction,
  updateBlogCategoryAction,
} from "./actions";

export const metadata: Metadata = { title: "블로그 CMS - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SearchParams = { message?: string; error?: string };
const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function AdminBlogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requireRole("ADMIN");
  const data = await getAdminBlogOverview(user.id);

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">블로그 CMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">카테고리, 수동 작성 글, 관리자 검수 전 AI 초안을 관리합니다.</p>
        </div>
        <div className="flex gap-3 text-sm"><Link href="/admin/blog/new" className="font-medium underline underline-offset-4">새 글 작성</Link><Link href="/admin/blog/ai" className="font-medium underline underline-offset-4">AI 초안 생성</Link><Link href="/admin/blog/automation" className="font-medium underline underline-offset-4">자동화 운영</Link><Link href="/blog" className="font-medium underline underline-offset-4">공개 블로그 보기</Link></div>
      </div>

      {params.message ? <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{params.message}</p> : null}
      {params.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p> : null}

      <Card>
        <CardHeader><CardTitle>카테고리 생성</CardTitle></CardHeader>
        <CardContent>
          <form action={createBlogCategoryAction} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm"><span>슬러그</span><input name="slug" required placeholder="driver-news" className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>이름</span><input name="name" required placeholder="기사 뉴스" className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>설명</span><input name="description" maxLength={300} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>정렬 순서</span><input name="sortOrder" type="number" defaultValue="0" min="-10000" max="10000" className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>상태</span><select name="isActive" defaultValue="true" className={inputClass}><option value="true">활성</option><option value="false">비활성</option></select></label>
            <div className="md:col-span-2"><Button type="submit">카테고리 생성</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>카테고리 관리</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.categories.length === 0 ? <p className="text-sm text-muted-foreground">카테고리가 없습니다.</p> : data.categories.map((category) => (
            <form key={category.id} action={updateBlogCategoryAction} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-6">
              <input type="hidden" name="categoryId" value={category.id} />
              <input aria-label="카테고리 슬러그" name="slug" defaultValue={category.slug} required className={`${inputClass} md:col-span-1`} />
              <input aria-label="카테고리 이름" name="name" defaultValue={category.name} required className={`${inputClass} md:col-span-1`} />
              <input aria-label="카테고리 설명" name="description" defaultValue={category.description ?? ""} maxLength={300} className={`${inputClass} md:col-span-2`} />
              <input aria-label="카테고리 정렬" name="sortOrder" type="number" defaultValue={category.sortOrder} min="-10000" max="10000" className={inputClass} />
              <div className="flex gap-2">
                <select aria-label="카테고리 상태" name="isActive" defaultValue={category.isActive ? "true" : "false"} className={inputClass}><option value="true">활성</option><option value="false">비활성</option></select>
                <Button type="submit" variant="outline" size="sm">저장</Button>
              </div>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>새 글 초안</CardTitle></CardHeader>
        <CardContent>
          <form action={createBlogArticleAction} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm"><span>슬러그</span><input name="slug" required placeholder="safe-driving-guide" className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>카테고리</span><select name="categoryId" defaultValue="" className={inputClass}><option value="">카테고리 없음</option>{data.categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>제목</span><input name="title" required maxLength={120} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>요약</span><input name="excerpt" maxLength={300} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>Markdown 본문</span><textarea name="contentMarkdown" required rows={8} className={textareaClass} placeholder="# 제목&#10;&#10;본문을 작성하세요." /></label>
            <label className="space-y-1 text-sm"><span>SEO 제목</span><input name="seoTitle" maxLength={70} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>SEO 설명</span><input name="seoDescription" maxLength={160} className={inputClass} /></label>
            <div className="md:col-span-2"><Button type="submit">초안 생성</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>글 목록</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.articles.length === 0 ? <p className="text-sm text-muted-foreground">작성된 글이 없습니다.</p> : data.articles.map((article) => (
            <div key={article.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4 text-sm">
              <div>
                <div className="font-semibold">{article.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">/{article.slug} · {article.category?.name ?? "미분류"} · {article.status} · 발행 {formatDate(article.publishedAt)} · 수정 {formatDate(article.updatedAt)}</div>
              </div>
              <div className="flex gap-3">
                <Link href={`/admin/blog/${article.id}/preview`} className="font-medium underline underline-offset-4">미리보기</Link>
                <Link href={`/admin/blog/${article.id}/edit`} className="font-medium underline underline-offset-4">편집</Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </Container>
  );
}
