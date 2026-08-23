import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { MarkdownArticle } from "@/components/blog/MarkdownArticle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminBlogArticle } from "@/lib/blog/service";
import { normalizeBlogTags } from "@/lib/blog/validation";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `블로그 미리보기 ${id} - 관리자`, robots: { index: false, follow: false } };
}

export default async function AdminBlogPreviewPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const user = await requireRole("ADMIN");
  const { article } = await getAdminBlogArticle(user.id, id);
  const articleTags = normalizeBlogTags(article.tags);

  return (
    <Container className="mx-auto max-w-4xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
        <span>관리자 미리보기 · {article.status} · 공개 검색 노출 없음</span>
        <div className="flex gap-3">
          <Link href={`/admin/blog/${article.id}/edit`} className="font-medium underline underline-offset-4">편집</Link>
          <Link href="/admin/blog" className="font-medium underline underline-offset-4">목록</Link>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          {article.category ? <p className="text-sm font-medium text-muted-foreground">{article.category.name}</p> : null}
          <CardTitle className="text-3xl">{article.title}</CardTitle>
          {article.excerpt ? <p className="text-base text-muted-foreground">{article.excerpt}</p> : null}
          {articleTags.length > 0 ? <p className="text-xs text-muted-foreground">{articleTags.map((tag) => `#${tag}`).join(" · ")}</p> : null}
          <p className="text-xs text-muted-foreground">작성자 {article.author?.name ?? "-"} · 발행 {article.publishedAt ? article.publishedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미발행"}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {article.featuredImageUrl ? <img src={article.featuredImageUrl} alt={article.featuredImageAlt ?? article.title} className="max-h-[520px] w-full rounded-xl object-cover" /> : null}
          <MarkdownArticle markdown={article.contentMarkdown} />
        </CardContent>
      </Card>
    </Container>
  );
}
