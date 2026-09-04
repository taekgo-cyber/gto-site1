import Link from "next/link";
import Image from "next/image";
import type { JobPostListItem } from "@/lib/jobs/dal";
import type { PostListItem } from "@/lib/posts/dal";
import type { PublicBlogArticleListItem } from "@/lib/blog/types";
import { formatPayAmount } from "@/lib/jobs/labels";
import { buildAttachmentUrl } from "@/lib/attachments/url";
import { HomeSectionHeading } from "./HomeSectionHeading";
import { ServiceIcon, type ServiceIconName } from "./ServiceIcon";
import { HomeEditorialImage } from "./HomeEditorialImage";

const SERVICES: { href: string; title: string; description: string; icon: ServiceIconName }[] = [
  { href: "/cbt", title: "CBT 시험센터", description: "학습과 모의시험", icon: "book" },
  { href: "/companies", title: "업체정보", description: "운송 업체 찾기", icon: "building" },
  { href: "/jobs", title: "채용정보", description: "운전 일자리 찾기", icon: "document" },
  { href: "/lease", title: "지입·차량", description: "차량·노선 비교", icon: "truck" },
  { href: "/blog", title: "운전·화물 가이드", description: "현장 실무 정보", icon: "book" },
  { href: "/support", title: "고객지원", description: "문의 및 이용 도움", icon: "support" },
];

function PublishedTime({ date, now }: { date: Date | null; now: Date }) {
  if (!date) return null;
  const hours = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3_600_000));
  return <span className="home-list-time">{hours < 24 ? <span className="home-new">NEW</span> : null}<time dateTime={date.toISOString()}>{hours < 1 ? "방금 전" : hours < 24 ? `${hours}시간 전` : date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" })}</time></span>;
}

export function HomeLatestInformation({ jobs, leases, now }: { jobs: JobPostListItem[]; leases: PostListItem[]; now: Date }) {
  return <div className="home-information-grid">
    <section className="home-panel" aria-labelledby="latest-jobs">
      <HomeSectionHeading id="latest-jobs" title="5. 최신 구인 정보 (무료)" href="/jobs" />
      {!jobs.length ? <p className="home-empty">새 구인공고가 등록되면 이곳에서 확인할 수 있습니다.</p> : <ul className="home-latest-list">{jobs.map(post => <li key={post.id}><Link href={`/jobs/${post.id}`}>
        <span className="home-list-icon"><ServiceIcon name="truck" /></span>
        <span className="home-list-copy"><strong>{post.title}</strong><span>{[post.originRegionName, post.vehicleTypeName, formatPayAmount(post.payType, post.payAmount)].filter(Boolean).join(" · ")}</span></span>
        <PublishedTime date={post.publishedAt} now={now} />
      </Link></li>)}</ul>}
    </section>
    <section className="home-panel" aria-labelledby="latest-lease">
      <HomeSectionHeading id="latest-lease" title="6. 최신 지입·차량 정보 (무료)" href="/lease" />
      {!leases.length ? <p className="home-empty">새 지입·차량 정보가 등록되면 이곳에서 확인할 수 있습니다.</p> : <ul className="home-latest-list">{leases.map(post => <li key={post.id}><Link href={`/lease/${post.id}`}>
        {post.representativeImage ? <Image src={buildAttachmentUrl(post.id, post.representativeImage.id)} alt="" width={48} height={36} className="home-list-thumbnail" /> : <span className="home-list-icon"><ServiceIcon name="truck" /></span>}
        <span className="home-list-copy"><strong>{post.title}</strong><span>{[post.regionName, post.tonnageName, formatPayAmount(post.payType, post.payAmount)].filter(Boolean).join(" · ")}</span></span>
        <PublishedTime date={post.publishedAt} now={now} />
      </Link></li>)}</ul>}
    </section>
    <section className="home-panel" aria-labelledby="home-services">
      <HomeSectionHeading id="home-services" title="7. 운전자를 위한 필수 서비스" />
      <div className="home-services">{SERVICES.map(item => <Link key={item.href} href={item.href}><ServiceIcon name={item.icon} /><span><strong>{item.title}</strong><small>{item.description}</small></span></Link>)}</div>
    </section>
  </div>;
}

export function HomeServiceRail() {
  return <aside className="home-service-rail" aria-label="운전픽 이용 안내">
    <Link href="/support" className="home-service-cta home-cta-consult"><ServiceIcon name="support" /><strong>지입·차량<br />상담 문의</strong><small>궁금한 내용을 남겨주세요.</small><span>상담 문의하기 ›</span></Link>
    <Link href="/cbt" className="home-service-cta home-cta-cbt"><ServiceIcon name="book" /><strong>화물운송 자격<br />CBT 시험센터</strong><small>과목별 학습 · 모의시험</small><span>학습 시작하기 ›</span></Link>
    <Link href="/company/apply" className="home-service-cta home-cta-company"><ServiceIcon name="building" /><strong>운송 파트너<br />업체 등록</strong><small>운전픽에서 기업을 소개하세요.</small><span>업체 등록하기 ›</span></Link>
    <Link href="/blog" className="home-service-cta home-cta-guide"><ServiceIcon name="document" /><strong>운전 생활<br />실무 가이드</strong><small>현장에서 필요한 운송 정보</small><span>가이드 바로가기 ›</span></Link>
  </aside>;
}

export function HomeBlogSection({ articles }: { articles: PublicBlogArticleListItem[] }) {
  return <section className="home-panel" aria-labelledby="home-blog">
    <HomeSectionHeading id="home-blog" title="8. 운전 생활 & 물류 정보 (블로그)" href="/blog" />
    {!articles.length ? <p className="home-empty">새로운 운전·물류 가이드가 발행되면 이곳에서 확인할 수 있습니다.</p> : <div className="home-blog-cards scrollbar-hidden">{articles.map(article => <Link href={`/blog/${article.slug}`} key={article.id} className="home-blog-card">
      <HomeEditorialImage article={article} />
      <div><h3>{article.title}</h3><p><span>{article.category?.name ?? "운전픽 가이드"}</span><time dateTime={article.publishedAt.toISOString()}>{article.publishedAt.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" })}</time></p></div>
    </Link>)}</div>}
  </section>;
}
