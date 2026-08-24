import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminBlogArticle } from "@/lib/blog/service";
import { normalizeBlogTags } from "@/lib/blog/validation";
import { readStoredAiQualityIssues } from "@/lib/blog/ai/quality";
import { scheduleBlogArticlePublicationAction, setBlogArticleStatusAction, updateBlogArticleAction } from "../../actions";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = { message?: string; error?: string };
const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `블로그 글 편집 ${id} - 관리자`, robots: { index: false, follow: false } };
}

export default async function AdminBlogEditPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireRole("ADMIN");
  const { article, categories } = await getAdminBlogArticle(user.id, id);
  const articleTags = normalizeBlogTags(article.tags);
  const aiQualityIssues = article.contentOrigin === "AI" ? readStoredAiQualityIssues(article.aiGenerationMeta) : [];

  return (
    <Container className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{article.status} · {article.publishedAt ? article.publishedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미발행"}</p>
          <h1 className="text-2xl font-bold">{article.title}</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/blog" className="font-medium underline underline-offset-4">목록</Link>
          <Link href={`/admin/blog/${article.id}/preview`} className="font-medium underline underline-offset-4">미리보기</Link>
          {article.status === "PUBLISHED" ? <Link href={`/blog/${article.slug}`} className="font-medium underline underline-offset-4">공개 글</Link> : null}
        </div>
      </div>

      {article.contentOrigin === "AI" ? (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          <strong>AI 생성 DRAFT</strong>
          <p className="mt-1 text-muted-foreground">자동 발행되지 않습니다. 내용을 직접 검수한 뒤 기존 발행 기능을 사용하세요.</p>
          {aiQualityIssues.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {aiQualityIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.severity}: {issue.message}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {query.message ? <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{query.message}</p> : null}
      {query.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{query.error}</p> : null}

      <Card>
        <CardHeader><CardTitle>글 내용</CardTitle></CardHeader>
        <CardContent>
          <form action={updateBlogArticleAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="articleId" value={article.id} />
            <label className="space-y-1 text-sm"><span>슬러그</span><input name="slug" required defaultValue={article.slug} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>카테고리</span><select name="categoryId" defaultValue={article.categoryId ?? ""} className={inputClass}><option value="">카테고리 없음</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " (비활성)"}</option>)}</select></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>제목</span><input name="title" required maxLength={120} defaultValue={article.title} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>요약</span><input name="excerpt" maxLength={300} defaultValue={article.excerpt ?? ""} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>태그 (쉼표 구분, 최대 10개)</span><input name="tags" defaultValue={articleTags.join(", ")} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>대표 이미지 URL</span><input name="featuredImageUrl" type="url" maxLength={2000} defaultValue={article.featuredImageUrl ?? ""} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>대표 이미지 ALT</span><input name="featuredImageAlt" maxLength={200} defaultValue={article.featuredImageAlt ?? ""} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>Markdown 본문</span><textarea name="contentMarkdown" required rows={24} defaultValue={article.contentMarkdown} className={textareaClass} /></label>
            <label className="space-y-1 text-sm"><span>SEO 제목</span><input name="seoTitle" maxLength={70} defaultValue={article.seoTitle ?? ""} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>SEO 설명</span><input name="seoDescription" maxLength={160} defaultValue={article.seoDescription ?? ""} className={inputClass} /></label>
            <div className="md:col-span-2"><Button type="submit">저장</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>발행 상태</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {article.status === "DRAFT" ? (
            <form action={setBlogArticleStatusAction}>
              <input type="hidden" name="articleId" value={article.id} />
              <input type="hidden" name="status" value="PUBLISHED" />
              <Button type="submit">발행</Button>
            </form>
          ) : null}
          {article.status === "DRAFT" ? (
            <form action={scheduleBlogArticlePublicationAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="articleId" value={article.id} />
              <label className="space-y-1 text-sm"><span>예약 발행 (KST)</span><input name="publishAt" type="datetime-local" required className={inputClass} /></label>
              <Button type="submit" variant="outline">예약 발행</Button>
            </form>
          ) : null}
          {article.status === "PUBLISHED" ? (
            <form action={setBlogArticleStatusAction}>
              <input type="hidden" name="articleId" value={article.id} />
              <input type="hidden" name="status" value="DRAFT" />
              <Button type="submit" variant="outline">초안으로 전환</Button>
            </form>
          ) : null}
          {article.status !== "ARCHIVED" ? (
            <form action={setBlogArticleStatusAction}>
              <input type="hidden" name="articleId" value={article.id} />
              <input type="hidden" name="status" value="ARCHIVED" />
              <Button type="submit" variant="outline">보관</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </Container>
  );
}
