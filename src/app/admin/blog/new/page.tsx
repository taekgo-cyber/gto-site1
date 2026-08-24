import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminBlogOverview } from "@/lib/blog/service";
import { createBlogArticleAction } from "../actions";

export const metadata: Metadata = { title: "블로그 새 글 - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export default async function AdminBlogNewPage() {
  const user = await requireRole("ADMIN");
  const { categories } = await getAdminBlogOverview(user.id);

  return (
    <Container className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">항상 DRAFT로 생성됩니다.</p>
          <h1 className="text-2xl font-bold">블로그 새 글</h1>
        </div>
        <Link href="/admin/blog" className="text-sm font-medium underline underline-offset-4">목록으로</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>콘텐츠</CardTitle></CardHeader>
        <CardContent>
          <form action={createBlogArticleAction} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm"><span>슬러그</span><input name="slug" required placeholder="cargo-market-guide" className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>카테고리</span><select name="categoryId" defaultValue="" className={inputClass}><option value="">카테고리 없음</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>제목</span><input name="title" required maxLength={120} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>요약</span><input name="excerpt" maxLength={300} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>태그 (쉼표 구분, 최대 10개)</span><input name="tags" placeholder="지입, 화물차, 운영팁" className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>대표 이미지 URL</span><input name="featuredImageUrl" type="url" maxLength={2000} placeholder="https://..." className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>대표 이미지 ALT</span><input name="featuredImageAlt" maxLength={200} className={inputClass} /></label>
            <label className="space-y-1 text-sm md:col-span-2"><span>Markdown 본문</span><textarea name="contentMarkdown" required rows={24} className={textareaClass} /></label>
            <label className="space-y-1 text-sm"><span>SEO 제목</span><input name="seoTitle" maxLength={70} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span>SEO 설명</span><input name="seoDescription" maxLength={160} className={inputClass} /></label>
            <div className="md:col-span-2 flex items-center gap-3"><Button type="submit">DRAFT 생성</Button><span className="text-xs text-muted-foreground">생성 후 미리보기·수정·발행할 수 있습니다.</span></div>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}
