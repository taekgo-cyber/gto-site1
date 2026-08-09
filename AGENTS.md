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
- DB 스키마/마이그레이션은 세션 02에서 진행한다.
