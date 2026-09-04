import Link from "next/link";
import { Brand } from "@/components/common/Brand";
import { Container } from "@/components/common/Container";

export function Footer() {
  return (
    <footer className="site-footer text-white">
      <Container className="site-footer-inner py-7">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)_1.2fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Brand />
            </Link>
            <p className="mt-4 text-sm leading-6 text-white/65">화물·운전 일자리 전문 플랫폼<br />좋은 일자리와 기회를 연결합니다.</p>
          </div>
          <FooterColumn title="서비스" links={[{ href: "/jobs", label: "채용정보" }, { href: "/lease", label: "지입·차량" }, { href: "/companies", label: "업체정보" }]} />
          <FooterColumn title="학습·정보" links={[{ href: "/cbt", label: "CBT 시험" }, { href: "/blog", label: "운전·화물 가이드" }, { href: "/search", label: "통합검색" }]} />
          <FooterColumn title="비즈니스·지원" links={[{ href: "/company/apply", label: "업체 등록" }, { href: "/company/ads", label: "광고 관리" }, { href: "/support", label: "고객지원" }]} />
          <div className="site-footer-support"><h2>고객센터</h2><Link href="/support">온라인 문의</Link><p>서비스 이용과 광고 문의를 남겨주세요.</p><Link href="/support" className="site-support-button">고객지원 바로가기 ›</Link></div>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} 운전픽. All rights reserved.</p>
          <p>공개된 정보는 등록 주체가 제공한 내용을 기준으로 합니다.</p>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-white">{title}</h2>
      <ul className="mt-3 space-y-2.5 text-sm text-white/65">
        {links.map((link) => (
          <li key={link.href}><Link className="transition-colors hover:text-white" href={link.href}>{link.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
