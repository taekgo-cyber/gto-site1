# GTO Blog Visual Standard

## Audience
핵심 독자:
- 40~60대 중장년층
- 지입차/화물운송에 관심 있는 사용자
- 재취업/전직을 고민하는 사용자
- 여러 유사 사이트를 비교하며 결정을 미루는 사용자

Visual/Content 목표:
독자가 정보를 충분히 읽고 “여기는 일단 상담이나 받아볼까?” “일자리/차량을 더 확인해볼까?” 라고 느낄 정도의 신뢰와 이해를 만드는 것.

## Images
기본:
- Featured 1 + Body 1
- 복잡한 글만 Body 1 추가 가능, 총 최대 3장 권장

사이즈:
- Featured: 1200×630 WebP (1.91:1)
- Body: 1200×675 WebP (16:9)

V2 Trust Editorial Visual:
- 현실적인 화물/물류 상황
- 중장년 현실 맥락
- 신뢰형 editorial
- 절제된 infographic
- 과장 광고 금지
- 저가 flat-template 느낌 금지

Alt/파일명:
- `<slug>-featured.webp`, `<slug>-body-1.webp`
- `public/images/blog/` canonical
- DB `featuredImageUrl`/`featuredImageAlt`는 절대 http(s) URL, ALT 필수

## Image Placement
- Featured: 상단 Hero (title/intro 직후, `max-h-[520px] rounded-xl object-cover`)
- Body: 본문 약 35~60% 지점
- Featured 직후 Body 연속 배치 금지 — 첫 화면에 이미지 2장이 몰리지 않게
- 학습/프로세스 글: 약 2단계 설명 후 (예: CBT 5단계 중 2단계 후 3단계 직전)
- 체크리스트 글: 약 2~3개 항목 후 (예: 7개 중 3개 후 4번 직전)
- 비교 글: 약 2개 관점 후 (예: 업무형태/차량준비 후 운행환경 직전)
- 정확한 위치는 글 흐름을 우선하며, markdown에서 `![alt](https://...)` 1장만 유지

## Typography
Blog (MarkdownArticle):
- paragraph / li / blockquote: `text-[17px] leading-[1.8] md:text-[18px]` — `leading-[1.8]` 고정
- H2: `text-[24px] md:text-[27px] leading-[1.4] font-bold`
- H3: `text-[20px] md:text-[22px] leading-[1.45]`
- H4: `text-[17px] md:text-[18px]`
- intro/excerpt: `text-[17px] md:text-[18px]`
- list: `space-y-2` 유지, image 전후 `space-y-6`
- reading width: `max-w-[800px]` (≈ 760~820px) — Featured/Body 이미지는 wrapper와 별도로 넓게 가능

Site 공통 (중장년 가독성 우선하되 보조 텍스트 과도 확대 금지):
- Header nav: `text-[15px] font-medium`, touch target `min-h-11` (≥44px), 로고는 `text-lg sm:text-xl` 유지하고 Header 높이 불필요 확대 금지
- Button: `sm`/`md` `text-[15px]`, `lg` `text-[16px]` — padding은 `px-3.5/4` 와 `min-h-11/12` 로 touch 확보, hierarchy 유지 (primary만 강하게)
- Input/Select/Textarea: `text-[16px]` 고정 (mobile 포함, `sm:text-sm` 제거로 iOS zoom 방지)
- Label: `text-[15px] font-medium`, helper/error `14~15px` 대비 확보
- Card: title `text-[17px]`, body 기본 15~17px, price/핵심조건은 별도 hierarchy, metadata 13~15px 가능
- Banner (AdPlacementSlot): title `text-[15px] leading-snug`, badge `text-[11px]`, company `text-[13px]` — baked-in 텍스트는 asset 재작업으로 분리
- Jobs/Lease detail: DetailRow `text-[15px]`, description 본문 `text-[17px] leading-[1.8]` — 숫자/지역/차종이 muted metadata에 묻히지 않게
- Footer: `text-sm` (14px) 유지, 법적/보조 링크 작게, 12px 이하 남용 금지

## Spacing / Rhythm
- heading → paragraph 간격은 `space-y-6` 으로 덩어리 구분
- paragraph → list `space-y-2`
- image → text 전후 충분한 여백, 과도한 공백으로 스크롤 과다 증가 금지

## Mobile / Desktop QA
- Mobile 390×844 기준: heading wrap, horizontal overflow 없음, touch 44px, input 16px+, CTA 가시성 확인
- Desktop: line-length 720~820px, card density/헤더 균형, hierarchy 유지

## Contrast / Hygiene
- muted text `#64748b` 가 연하지 않게, focus-visible 유지, link는 `underline underline-offset-4` 로 구분, CTA는 `bg-primary` 대비 확보 — 새 색체계 생성 금지

## Functional Lock
- DB/schema/migration, ranking/search/recommendation, monetization/auth/analytics, CTA discovery, image URL/ALT/publish 상태 변경 금지 — visual/readability만 대상
