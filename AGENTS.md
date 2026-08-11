<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 프로젝트 개발 규칙

이 프로젝트는 운송/화물차 정보 포털 서비스다. 여러 세션에 걸쳐 단계적으로
개발하며, 각 세션의 결과물은 다음 세션의 개발자가 그대로 이어받는다.

## 기술 스택

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS 4 (`@theme` 기반 디자인 토큰)
- Prisma 7 (`@prisma/client` + `@prisma/adapter-pg` Driver Adapter, PostgreSQL)
- ESLint (flat config)
- 패키지 매니저: npm

## 디렉터리 구조

```text
src/
├── app/                  # 라우트(페이지/레이아웃)
├── components/
│   ├── common/           # Container 등 공용 컴포넌트
│   ├── layout/           # Header/Footer 등 레이아웃 컴포넌트
│   └── ui/               # Button/Input/Card 등 기본 UI
├── generated/prisma/     # prisma generate 산출물 (gitignore 대상, 재생성됨)
├── lib/                  # 유틸/prisma 클라이언트 등
└── (기능이 필요한 시점에 services/ types/ hooks/ utils/ 추가)
```

## 개발 원칙

- 기존 코드를 함부로 삭제하지 않는다.
- 작업 전에 관련 파일과 Next.js 16 문서를 먼저 확인한다.
  (`node_modules/next/dist/docs/`, 상단 nextjs-agent-rules 블록 참고)
- 기능별로 컴포넌트를 분리한다.
- 중복 코드를 최소화한다.
- Secret을 코드에 작성하지 않는다. 환경변수 파일(`.env*`)은 커밋하지 않고,
  `.env.example`에 키만 문서화한다.
- 타입 안정성을 유지한다.
- 가능한 한 작은 단위로 변경한다.
- 작업 후 `npm run lint`, `npm run typecheck`, `npm run build`를 실행한다.
- 기존 기능을 깨뜨리지 않는다.
- 임의로 새로운 기술이나 라이브러리를 추가하지 않는다. 추가가 필요한 경우
  사용자와 논의한다.

## Prisma 7 주의사항

- `prisma.config.ts`가 설정의 진원지이며 `dotenv`를 통해 `.env`를 로드한다.
- 생성기는 `prisma-client`(출력: `src/generated/prisma`)를 사용한다.
  스키마 변경 후 `npm run prisma:generate`를 실행한다.
- 클라이언트 생성 시 `@prisma/adapter-pg`의 `PrismaPg` Driver Adapter가 필요하다.
- DB 스키마는 세션 02에서 시작해 세션별로 확장했다(현재 모델 24개).
  로컬 PostgreSQL은 Docker(`gto_site_postgres`)로 실행하며, 스키마 변경 후
  `npx prisma migrate dev --name <이름>`으로 마이그레이션한다.
- CBT(CbtCategory/CbtQuestion) 정답 데이터는 최초 문제 조회 payload에 포함하지
  않는다. `getPublicQuestionsByCategorySlug`는 `select`에서 `correctOption`/
  `explanation`을 제외하고, 학습 채점은 서버 액션 `gradeCbtAnswerAction`,
  모의고사 채점은 서버 액션 `submitCbtExamAction`을 통해 수행한다.
- 모의고사 진행 중에는 정답/해설을 클라이언트에 내려주지 않으며, 제출 후에만
  서버가 점수·정답·해설을 반환한다.
- 보기 랜덤화는 원본 `option.id`를 유지한 채 표시 순서만 셔플한다(`shuffle.ts`).
  사용자가 보는 번호(1..n)와 DB `option.id`는 분리되며, "정답 N번"은
  `getDisplayIndexOfOption`으로 화면 번호에 역매핑한다. 문제/보기 셔플은
  서버 컴포넌트(force-dynamic)에서 수행해 hydration mismatch를 방지한다.
- 사용자별 학습 상태는 `CbtQuestionActivity`(userId+questionId 복합키 upsert),
  모의고사 결과는 `CbtExamRecord`에 저장한다. CBT 풀이 자체는 비로그인도
  가능하며, 로그인은 오답/북마크/시험 기록 영구 저장에만 필요하다.
