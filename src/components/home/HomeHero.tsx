import Image from "next/image";
import Link from "next/link";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import { ServiceIcon } from "./ServiceIcon";

const QUICK_FILTERS = [
  { href: "/jobs?type=JOB", label: "운전기사 구인" },
  { href: "/jobs?type=TRANSPORT", label: "운송·배차" },
  { href: "/lease?type=HIRE", label: "지입 구인" },
  { href: "/lease?type=SEEK", label: "지입 구직" },
] as const;
const SEARCH_CHIPS = ["1톤", "2.5톤", "5톤", "윙바디", "냉동탑차", "카고", "지입차", "초보가능", "주5일", "주6일", "장거리"];

export function HomeHero({ jobCount, leaseCount }: { jobCount: number; leaseCount: number }) {
  return <section className="home-hero" aria-labelledby="home-title">
    <Image src="/images/blog/lease-tonnage-choice-beginners-featured.webp" alt="화물 운송을 위한 카고와 탑차" fill preload sizes="(min-width: 1280px) 1050px, 100vw" className="home-hero-image" />
    <div className="home-hero-shade" />
    <div className="home-hero-copy">
      <h1 id="home-title">화물·운전 일자리<br />전문 플랫폼, <span>운전픽</span></h1>
      <p>좋은 일자리와 좋은 기회를 연결합니다.</p>
      <div className="home-search"><UnifiedSearchForm formId="home-search" inputId="home-search-input" ariaLabel="홈 통합검색" placeholder="지역, 키워드, 회사명으로 검색" variant="hero" /></div>
      <nav aria-label="빠른 조건 찾기" className="home-quick-filters">
        {QUICK_FILTERS.map(item => <Link key={item.href} href={item.href}>{item.label}<span aria-hidden="true">⌄</span></Link>)}
      </nav>
      <nav aria-label="차량·운행 키워드 검색" className="home-search-chips">
        {SEARCH_CHIPS.map(label => <Link key={label} href={`/search?q=${encodeURIComponent(label)}`}>{label}</Link>)}
      </nav>
    </div>
    <dl className="home-metrics" aria-label="공개 운송 정보 현황">
      <div><ServiceIcon name="truck" /><dt>더 살펴볼 구인·운송</dt><dd>{jobCount.toLocaleString("ko-KR")}<small>건</small></dd></div>
      <div><ServiceIcon name="document" /><dt>더 살펴볼 지입·차량</dt><dd>{leaseCount.toLocaleString("ko-KR")}<small>건</small></dd></div>
      <div className="home-metrics-note">내게 맞는 운송 조건을<br />운전픽에서 찾아보세요.</div>
    </dl>
  </section>;
}
