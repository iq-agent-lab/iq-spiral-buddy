# Claude Code Context — iq-spiral-buddy

이 파일은 Claude Code가 이 레포에서 작업할 때 자동으로 읽는 컨텍스트야.

## 현재 진입 시 상태 (2026-05 기준)

- **Phase 2.3까지 완성, Phase 3 (Notion) 시도 후 롤백.**
- 핵심 기능 다 동작 — 동적 로드맵, Curated GitHub, 사이드바 3-level 계층, 세션 인터럽트, End SSE 진행 카드, 모델 셀렉터.
- 노트 출력은 **Obsidian만** (단일 target). `<vault>/spiral-buddy/<날짜>-<chapter-basename>-d<depth>.md`.
- 파일명 가독성 개선분(chapter_id basename 우선 + H1 자동 추가)은 유지함.

## 이번 작업의 미션 — 챕터 순서 정규화

### 문제

`SPIRAL_ROADMAP_ROOT` 아래의 deep-dive 레포들 중 일부는 챕터 파일이 **숫자 prefix 없음**.

예시 (정상):
```
ioc-container/
├── 01-beanfactory.md
├── 02-applicationcontext.md
└── 03-bean-lifecycle.md
```

예시 (문제):
```
some-deep-dive/
├── bean-creation.md
├── proxy-mechanism.md
├── aop-internals.md
└── README.md
```

이 경우:
1. 로드맵으로는 잘 잡힘 (.md 2개+ 조건 충족)
2. **챕터 순서가 불확정** — `loadRoadmapChapters`가 보통 알파벳 정렬을 함 (`bean-creation.md` → `proxy-mechanism.md`)
3. README가 의도한 학습 순서(예: AOP → proxy → bean creation)와 다를 가능성 있음
4. 학습 흐름이 깨지고, depth/spiral 감지에서도 잘못된 prior 문맥 사용 가능

### 사용자 요구사항

> "리드미를 읽어서 챕터를 파악해서 챕터 순서가 있는 걸로 수정해서 원격에 반영하고 돌리면 문제가 없나?"

**즉, 자동화 도구를 만들어서**:
1. 챕터 번호 없는 레포를 찾기
2. 그 레포의 `README.md`를 읽어서 의도된 학습 순서 추론
3. 파일명을 `01-...`, `02-...`로 일괄 rename
4. git commit + push로 원격 반영
5. 그 후 spiral-buddy 재실행하면 정상 순서로 챕터 인식

### 깊게 고민할 포인트들

#### 1. "챕터 번호 없음"을 어떻게 판정?
- 단순 정규식: `/^\d+[-_]/` 안 매칭되는 파일이 N개 이상
- 부분 매칭(반은 있고 반은 없음)도 비정상으로 봐야 함
- README는 제외
- `_index.md`, `_toc.md` 같은 메타 파일도 제외

#### 2. README에서 순서를 어떻게 추출?
가능한 패턴들:
- 마크다운 리스트 (`- [Chapter 1](./01-foo.md)` 형식) — 가장 신뢰성 높음
- 단순 텍스트 (`1. Bean creation 2. AOP ...`) — 매칭 어려움
- 표 형식 — 케이스 다양
- 외부 링크만 있는 경우

**전략**:
1. 우선 마크다운 링크 추출 (`\[.*\]\(\.?/(.+?\.md)\)`)
2. 그 순서대로 파일명에 매칭
3. 매칭률 80%+ 면 자동 rename 진행
4. 미만이면 사용자에게 제안 출력 + 수동 확인 요청

대안: Claude API로 README 본문 + 파일 목록 주고 순서 추론하라고 — 더 robust하지만 비용 발생.

#### 3. Git 작업 안전성
- 각 레포가 독립 git repo여야 함 (curated는 그렇지만 local은 다를 수 있음)
- 작업 전 `git status` clean 확인 (dirty면 abort)
- 새 브랜치(`chore/normalize-chapters`) 만들고 작업
- `git mv` 사용 (history 보존)
- 그 후 사용자에게 commit/push 여부 확인 (자동 push 안 하는 게 안전)

#### 4. spiral-buddy 자체에 영향
파일명이 바뀌면:
- `chapter_id`가 바뀌어 옛 노트와 매칭 안 됨
- 이걸 어떻게 처리? 옵션:
  a) chapter_id에 alias 매핑 추가 (`bean-creation.md` → `01-bean-creation.md`)
  b) 옛 노트의 frontmatter도 일괄 갱신
  c) 무시 — 옛 노트는 그대로, 새 학습부터 새 chapter_id 사용 (가장 단순)

**권장 (c)** — Phase 2.3에 이미 옛 스키마 호환 매칭(`basename + suffix`)이 있어서 큰 문제 없을 가능성. 다만 보수적으로 검증 필요.

### 작업 산출물 제안

새 CLI tool: `scripts/normalize-chapters.ts`

```bash
# dry-run (변경 안 함, 제안만 출력)
pnpm tsx scripts/normalize-chapters.ts --root ~/iq-lab/iq-dev-lab

# 특정 레포만
pnpm tsx scripts/normalize-chapters.ts --root ~/iq-lab/iq-dev-lab --repo some-deep-dive

# 실제 rename + git mv + 새 브랜치 commit (push는 사용자가 직접)
pnpm tsx scripts/normalize-chapters.ts --root ~/iq-lab/iq-dev-lab --apply

# README 분석 실패 시 Claude API로 fallback
pnpm tsx scripts/normalize-chapters.ts --root ~/iq-lab/iq-dev-lab --apply --use-llm
```

출력 예시:
```
스캔 중: ~/iq-lab/iq-dev-lab/...
- ✓ spring-core-deep-dive/ioc-container (모두 번호 있음, skip)
- ⚠ some-deep-dive (5개 파일, 번호 없음)
   README에서 추출한 순서:
     1. bean-creation.md → 01-bean-creation.md
     2. proxy-mechanism.md → 02-proxy-mechanism.md
     ...
   매칭률: 100%
   변경 사항: 5 files renamed via git mv
   브랜치: chore/normalize-chapters-some-deep-dive
   commit: "chore: 챕터 파일에 순서 번호 부여 (README 기반)"

⚠ 미해결: another-repo (README 매칭률 60%, manual review 필요)
```

### 우선순위

1. **dry-run + 진단 먼저** — 실제로 몇 개 레포가 영향받는지 파악
2. README 패턴 추출 알고리즘 (regex 기반 → 90%는 잡힐 듯)
3. 매칭률 낮은 케이스는 LLM fallback (선택)
4. git 작업은 마지막 단계, 사용자 확인 후

### 작업 시 주의사항

- **`~/iq-lab/iq-dev-lab/`은 사용자의 실제 학습 자료 디렉토리** — 신중하게.
- spiral-buddy의 `~/iq-spiral-buddy/.cache/curated/`는 별개 (on-demand clone된 캐시). 여기는 건드릴 필요 없음.
- 파일명 바꿀 때 case-insensitive 충돌 주의 (macOS는 기본 case-insensitive).
- 한글 파일명 케이스 — 영어로 일관성 있게 정규화할지 그대로 둘지 결정 필요.

## 이 레포의 디렉토리 구조 (참고)

```
src/
  ├ config.ts          ─ 환경변수 + Config 인터페이스
  ├ roadmap.ts         ─ discoverRoadmaps, loadRoadmapChapters (← 챕터 순서는 여기서 결정됨)
  ├ vault.ts           ─ 노트 R/W, listSpiralNotes
  ├ note-writer.ts     ─ 8섹션 구조화, 누락 자동 보충
  ├ spiral.ts          ─ Claude suggest next chapter
  ├ session-store.ts   ─ in-memory 세션 map
  ├ claude.ts          ─ Anthropic SDK wrapper
  ├ curated.ts         ─ GitHub 조직 레포 on-demand clone
  ├ categories.ts      ─ org → 카테고리 매핑
  ├ routes.ts          ─ Hono API routes
  ├ server.ts          ─ 진입점 (웹앱)
  └ mcp.ts             ─ MCP 서버 진입점

client/                ─ 브라우저 SPA (vanilla JS + ESM)
docs/                  ─ phase별 spec
scripts/               ─ 통합 테스트, 일회성 도구 (← normalize-chapters.ts는 여기에)
data/curated-categories.json  ─ iq-dev-lab 9개 카테고리 매핑
```

핵심 함수 — `src/roadmap.ts::loadRoadmapChapters`:
```ts
// 현재 챕터 정렬 로직 — 어떻게 동작하는지 확인 필요
// (기본은 fs.readdir + alphabetical일 것으로 추정)
```

## 권한 / 신뢰 경계

- 이 도구는 너의 local repos를 직접 수정함. dry-run을 항상 먼저.
- `git mv` 후엔 `git status`로 검증.
- push는 절대 자동으로 하지 말 것 — 사용자가 직접 `git push` 하도록.

## 미해결 의문

- README가 아예 없는 레포는 어떻게? → skip + 경고
- README는 있는데 챕터 링크가 없는 경우? → LLM fallback or skip
- 챕터가 README의 nested 구조 (모듈 → 챕터)인 경우? → 일단 top-level만 처리, nested는 v2에서
- 이미 number 있는데 띄엄띄엄 (01, 03, 05)이면? → 연속 번호로 재정렬할지 사용자 선택

## 작업 흐름 권장

1. 먼저 `src/roadmap.ts`의 챕터 정렬 로직 확인
2. dry-run 스크립트 작성 + 사용자 레포 스캔 결과 출력
3. 사용자와 매칭 케이스 검토 (어떤 레포가 문제인지)
4. README 추출 로직 정교화
5. git 작업 자동화 (branch + commit, push는 수동)
6. spiral-buddy 재실행 후 챕터 순서 정상인지 확인
7. 옛 노트 호환성 검증 (chapter_id 매칭 깨지는지)
