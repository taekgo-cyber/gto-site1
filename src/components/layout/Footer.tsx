import Link from "next/link";
import { Container } from "@/components/common/Container";

export function Footer() {
  return (
    <footer className="bg-brand-deep text-white">
      <Container className="py-10 sm:py-12">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-black">운</span>
              <span className="text-2xl font-black tracking-[-0.04em]">운전픽</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-white/65">화물·운전 구인공고, 지입·차량 정보, 업체 정보와 자격시험 학습을 연결하는 전문 플랫폼입니다.</p>
          </div>
          <FooterColumn title="일자리·차량" links={[{ href: "/jobs", label: "채용정보" }, { href: "/lease", label: "지입·차량" }, { href: "/companies", label: "업체정보" }]} />
          <FooterColumn title="학습·정보" links={[{ href: "/cbt", label: "CBT 시험" }, { href: "/blog", label: "운전·화물 가이드" }, { href: "/search", label: "통합검색" }]} />
          <FooterColumn title="비즈니스·지원" links={[{ href: "/company/apply", label: "업체 등록" }, { href: "/company/ads", label: "광고 관리" }, { href: "/support", label: "고객지원" }]} />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
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
