# 🌀 iq-spiral-buddy

> Spiral learning companion that bridges Claude and Obsidian.
> 로컬 웹앱 + Claude Desktop MCP 동시 제공.

학습 로드맵을 기반으로 Claude와 Socratic 학습 세션을 진행하고, 그 결과를 옵시디언에 **나선형 구조로 자동 축적**하는 도구. `pnpm dev` 치면 브라우저가 자동으로 열리고, 다음 세션엔 이전 노트가 자동 컨텍스트로 들어가서 "어디까지 했더라"를 매번 다시 만들 필요가 없다.

```
📁 Local 로드맵 + 📚 GitHub Curated 레포 → Claude 학습 세션 → 8섹션 노트 → Obsidian
```

## 무엇이 다른가

옵시디언 + AI 도구는 이미 많다. spiral-buddy의 차별점:

1. **로드맵 주도** — vault 안에서 채팅하는 게 아니라, 외부 학습 커리큘럼(`SPIRAL_ROADMAP_ROOT`의 폴더 트리, 또는 GitHub 조직의 public 레포)을 1급 시민으로 다룬다. "오늘 뭐 배울까"를 도구가 제안한다.
2. **나선형 감지(Spiral detection)** — 새 세션 시작 시 이전 노트를 스캔해 같은 챕터를 더 깊게 갈지(`deeper-layer`), 새 진도 나갈지(`next-chapter`), 멀리 떨어진 챕터를 연결할지(`cross-link`) Claude가 판단한다.
3. **세션 후 구조화** — 대화 로그를 통째로 저장하는 게 아니라, 8-섹션 템플릿(요약 / 핵심 개념 / 직관·비유 / 짚고 넘어간 예제 / 헷갈렸던 지점 / 이전 학습과의 연결 / 다음에 볼 것)에 맞춰 Claude가 정리한다. 누락된 섹션은 자동 보충.
4. **두 가지 source 공존** — 사용자의 로컬 디렉토리(Local) + GitHub 조직 큐레이션(Curated, default: `iq-dev-lab`의 38+개 deep-dive 레포). on-demand 클론으로 디스크 절약.
5. **두 가지 진입점** — 로컬 웹앱(streaming 채팅 UI + 진도/사이드바)과 Claude Desktop MCP(7개 도구). 같은 노트 vault 공유.

## Status

✅ **Phase 2.3 — Stable**

핵심 기능 다 동작. 세 가설 검증 중:
- 로드맵 주도 세션이 그냥 채팅보다 학습 효과가 있는가
- 자동 생성된 노트가 나중에 다시 봤을 때 쓸 만한가
- 나선형 감지가 의미 있는 연결을 찾아내는가

상세 design docs: [docs/phase-1.5-dynamic-roadmaps.md](docs/phase-1.5-dynamic-roadmaps.md), [docs/phase-2-curated.md](docs/phase-2-curated.md)

## 설치 + 첫 실행

```bash
git clone https://github.com/iq-agent-lab/iq-spiral-buddy
cd iq-spiral-buddy
pnpm install
cp .env.example .env
# .env 편집: ANTHROPIC_API_KEY, SPIRAL_VAULT_PATH 두 개만 필수
# SPIRAL_ROADMAP_ROOT는 빈 칸으로 둬도 OK — iq-dev-lab의 38+개 학습 레포가 디폴트로 노출됨
pnpm dev
```

요구사항: Node.js 20+, pnpm 9+, [Anthropic API 키](https://console.anthropic.com/), [Obsidian](https://obsidian.md/) vault, `git` (Curated 클론용).

부팅 후 자동으로 `http://localhost:3737` 열림.

### 첫 사용자 흐름 (5분 안에)

1. 좌측 사이드바 → **📚 Curated · 받기 가능 보기** 토글 클릭
2. iq-dev-lab의 38개 레포가 9개 카테고리(☕ Java Core, 🍃 Spring Ecosystem, 🗄️ Database, …)로 묶여 표시됨
3. 카테고리 클릭해서 펼치고 관심 가는 레포의 **📥 받기** 클릭 → on-demand `git clone --depth=1` (10-30초)
4. 클론 완료되면 자동으로 첫 챕터의 학습 세션이 활성화 가능 상태
5. 챕터 클릭 → Claude가 Socratic 질문으로 학습 시작
6. 대화 끝나면 **End & Save** 버튼 → 8섹션 노트가 Obsidian에 자동 저장 (단계별 진행 카드로 시각화)

## 사이드바 구조

```
🌀 spiral buddy
   [모델 ▼  Sonnet 4.6  (balanced)]      ← 모델 선택 (Opus 4.7/4.6 / Sonnet 4.6 / Haiku 4.5)
─────────────
ROADMAP
   [📁 transaction-mvcc       2/7 ▼]    ← 현재 active 로드맵
─────────────
🧭 SUGGESTION (이 로드맵 기준)             ← Claude가 deeper-layer/next-chapter/cross-link 판단
─────────────
CHAPTERS (이 로드맵의 챕터들)
   1. ACID                  d2
   2. Isolation
   ...
─────────────
PAST SESSIONS (이 로드맵)
   d1 · 2026-05-13 · ACID
   ...
```

**로드맵 셀렉터 펼치면** 3-level 계층:
- **📁 Local · 9 카테고리 · 38 레포 · 286 로드맵**
  - ▶ ☕ Java Core (7 레포)
    - ▶ 📦 jvm-deep-dive (10 챕터)
    - ▶ 📦 java-concurrency-deep-dive (40 챕터)
    - ...
- **📚 Curated · iq-dev-lab (받은 거만)**
- **▶ 받기 가능 보기 (남은 거)**

active 로드맵의 카테고리/레포는 자동으로 펼친 상태로 시작. 학습 중 다른 데 보고 싶으면 사이드바 닫기(**⌘B / Ctrl+B**)도 가능.

## 환경변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 (웹앱 전용 — MCP는 Claude Desktop 자체 인증 사용) | **(필수)** |
| `SPIRAL_VAULT_PATH` | 옵시디언 vault 루트 또는 그 하위 폴더 (`.obsidian/` 자동 탐지) | **(필수)** |
| `SPIRAL_ROADMAP_ROOT` | 로컬 로드맵 root. 미설정이면 Curated만 사용 | (선택) |
| `SPIRAL_ROADMAP_PATH` | (legacy) 단일 로드맵만 강제 지정 | (선택) |
| `SPIRAL_CURATED_ORG` | Curated source의 GitHub 조직 이름 | `iq-dev-lab` |
| `SPIRAL_DISABLE_CURATED` | `1`로 설정하면 Curated source 꺼짐 (Local만) | (off) |
| `SPIRAL_GITHUB_TOKEN` | GitHub API 인증. unauth 60req/hr → auth 5000req/hr | (선택) |
| `SPIRAL_VAULT_NAME` | 옵시디언 vault 이름 (폴더명과 다를 때만) | 자동 탐지 |
| `SPIRAL_MODEL` | 기본 Claude 모델 (UI에서 변경 가능) | `claude-sonnet-4-6` |
| `SPIRAL_MAX_TOKENS` | 응답당 최대 토큰 | `4096` |
| `PORT` | 웹서버 포트 | `3737` |
| `NO_OPEN` | `1`로 설정하면 브라우저 자동 오픈 안 함 | (off) |

## 로드맵 자동 탐지 규칙

`SPIRAL_ROADMAP_ROOT` 아래에서:
- **로드맵 = README.md를 제외한 `.md` 파일이 2개 이상 직접 들어있는 디렉토리**
- 최대 깊이 6단계까지 재귀 탐색
- 로드맵으로 인식된 디렉토리 안은 더 탐색하지 않음 (sub-section 오인 방지)

```
iq-dev-lab/                              ← root
├── spring ecosystem/                    ← 카테고리 (.md 없으면 통과)
│   └── spring-core-deep-dive/           ← 레포 (.md 없으면 통과)
│       ├── ioc-container/               ← 여기 .md 2개+ → 로드맵
│       │   ├── 01-beanfactory.md
│       │   └── 02-applicationcontext.md
│       └── transaction-mvcc/            ← 또 다른 로드맵
│           ├── 01-acid.md
│           └── 02-isolation.md
└── redis-deep-dive/                     ← 로드맵
    ├── 01-data-structures.md
    └── ...
```

탐지 결과:
- `spring ecosystem/spring-core-deep-dive/ioc-container`
- `spring ecosystem/spring-core-deep-dive/transaction-mvcc`
- `redis-deep-dive`

UI에선 path 첫 segment가 카테고리(`spring ecosystem` → 🍃 Spring Ecosystem)로, 두 번째 segment가 레포(`spring-core-deep-dive`)로, 세 번째 이후가 sub-roadmap으로 자동 분류.

## Curated source (GitHub 큐레이션)

기본값으로 `iq-dev-lab` 조직의 public 레포를 학습 자료로 노출. 다른 사람도 spiral-buddy를 clone만 하면 즉시 학습 시작 가능.

특징:
- **목록만 GitHub API로** (1시간 캐시) → API 요청 절약
- **레포는 사용자 클릭 시점에만 클론** (`git clone --depth=1`) → 디스크 절약
- archived/fork/private/0byte/meta(.github, *.github.io) 자동 제외
- 한 레포가 여러 sub-roadmap을 가질 수 있음 (sub-directory별로)
- `iq-dev-lab`의 38개 레포가 9개 카테고리로 자동 매핑 (`data/curated-categories.json`)

다른 조직 학습 자료 만들고 싶으면:
```bash
# .env
SPIRAL_CURATED_ORG=your-org
```

화이트리스트 카테고리 매핑 추가는 `data/curated-categories.json`에 추가하면 됨 (없어도 단일 'All' 카테고리로 fallback).

## 노트 출력 (Obsidian)

저장 위치: `<vault>/spiral-buddy/`

파일명: `<날짜>-<주제>-d<depth>.md`

```yaml
---
title: "ACID"
topic: "ACID"
date: 2026-05-13
depth: 2
chapter_id: "01-acid.md"
roadmap: "transaction-mvcc"
roadmap_id: "spring ecosystem/spring-core-deep-dive/transaction-mvcc"
tags: ["transaction", "isolation", "acid"]
summary: "트랜잭션의 4가지 속성과 isolation level이 실제 동시성 이슈에 어떻게 매핑되는지."
related:
  - "[[2026-05-01-mvcc-d1]]"
generator: iq-spiral-buddy
---

## 한 줄 요약
...

## 핵심 개념
...

## 직관 / 비유
...

## 짚고 넘어간 예제
...

## 헷갈렸던 / 확인이 필요한 지점
...

## 이전 학습과의 연결
...

## 다음에 볼 것
...
```

8섹션 헤딩 중 누락된 게 있으면 `_이번 세션에서 다루지 않음._` 한 줄로 자동 보충 + UI에 경고.

`roadmap_id`는 글로벌 unique 식별자(root-relative path). `chapter_id`는 roadmap 내부 path. 두 값의 튜플이 글로벌 챕터 식별.

옛 스키마(`roadmap_id` 없음) 노트와도 호환 매칭 — basename + suffix 룰로 진도 계산에 포함.

## MCP 서버 (Claude Desktop)

웹앱 외에 Claude Desktop에서 자연어로 spiral-buddy 사용 가능. 7개 도구:

```json
// Claude Desktop config
{
  "mcpServers": {
    "iq-spiral-buddy": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/iq-spiral-buddy", "mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "...",
        "SPIRAL_VAULT_PATH": "/path/to/Obsidian Vault",
        "SPIRAL_ROADMAP_ROOT": "/path/to/iq-dev-lab"
      }
    }
  }
}
```

### 등록된 도구

| 도구 | 용도 |
|---|---|
| `spiral_list_roadmaps` | Local + Curated 통합 표시. `include_available=true`로 미설치 큐레이션 레포도 |
| `spiral_install_curated` | GitHub 조직 레포 on-demand 클론 |
| `spiral_list_chapters` | 특정 로드맵의 챕터 + 학습 진도 |
| `spiral_get_chapter_context` | 챕터 본문 + 이전 노트 (세션 시작용) |
| `spiral_list_notes` | 과거 노트 인덱스 (로드맵별 필터) |
| `spiral_read_note` | 특정 노트 본문 읽기 |
| `spiral_save_note` | 8섹션 구조화 노트 저장 (누락 자동 보충) |

모든 도구 응답은 풍부한 마크다운 표/리스트로 반환되어 Claude Desktop이 가공 없이 그대로 보여줌.

자연어 사용 예시:
> "spiral-buddy로 학습할 만한 로드맵 뭐 있어?"
→ `spiral_list_roadmaps` → 표 출력

> "transaction-mvcc 로드맵의 ACID 챕터 deeper-layer로 가자"
→ `spiral_list_chapters` → `spiral_get_chapter_context` → 학습 대화 → `spiral_save_note`

> "redis-deep-dive 받아서 시작하자"
→ `spiral_install_curated` → `spiral_list_chapters` → …

## 웹앱 핵심 UX

- **세션 인터럽트 처리** — 학습 중 다른 챕터로 이동하려 하면 3-way modal: **저장하고 이동** / **폐기하고 이동** / **취소**. 옛날엔 confirm 하나로 30분 대화가 그냥 사라지는 게 가능했지만 이제 안 됨.
- **End 진행 시각화** — 노트 저장이 SSE로 3단계(대화 분석 → 노트 작성 → vault 저장) 표시. 완료 후 카드 안에 요약 + 옵시디언에서 열기 버튼.
- **사이드바 토글** — `⌘B` / `Ctrl+B`로 학습 중 사이드바 숨겨서 집중 모드. 상태는 localStorage 저장.
- **모델 선택** — 헤더 드롭다운으로 세션 시작 전 모델 선택. tier 뱃지(highest/high/balanced/fast).
- **계층 사이드바** — Category → Repo → Sub-roadmap 3-level. active 로드맵의 cat/repo는 자동 펼침 (사용자가 닫으면 그 의도 유지 — 매 렌더마다 다시 펼치지 않음).
- **페이지 닫기 경고** — 세션 중 탭 닫으면 `beforeunload` 경고로 손실 방지.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Browser (vanilla JS · ES module · marked · hljs)      │
│   ↕ fetch + SSE                                         │
│  Hono server on localhost:3737                          │
│   ├ /api/{config, models, roadmaps, chapters, history}  │
│   ├ /api/curated/{available, install, refresh, etc.}    │
│   ├ /api/session/{start, message, end, cancel}          │
│   └ static client                                       │
│   ↕ in-process                                          │
│  roadmap.ts      → discoverRoadmaps(ROADMAP_ROOT)       │
│  curated.ts      → GitHub API + on-demand git clone     │
│  categories.ts   → org → categories 매핑                 │
│  vault.ts        → vault 노트 R/W (8섹션, 호환 매칭)      │
│  spiral.ts       → Claude judges next chapter           │
│  note-writer.ts  → 8섹션 구조화 + 누락 자동 보충         │
│  session-store.ts → in-memory session map               │
│  claude.ts       → Anthropic SDK wrapper (model 분기)    │
│                                                          │
│  mcp.ts (별도 entry) ───────────► Claude Desktop        │
│   stdio · 7 tools · markdown-first responses            │
└─────────────────────────────────────────────────────────┘
```

빌드 파이프라인 없음. 클라이언트는 ES 모듈을 브라우저가 직접 로드. tsx가 서버 TS를 그 자리에서 실행.

## 로드맵 (도구의)

- [x] Phase 0 — CLI 프로토타입 (폐기)
- [x] Phase 0.5 — 로컬 웹앱 MVP
- [x] Phase 1 — MCP 서버 + Claude Desktop 통합
- [x] Phase 1.5 — 동적 로드맵 + MCP 마크다운 응답
- [x] Phase 2 — Curated GitHub source
- [x] Phase 2.1 — 카테고리 분류 + 메타 레포 제외
- [x] Phase 2.2 — 디자인 리뉴얼 (브랜드, 모델 선택, End SSE)
- [x] **Phase 2.3 — UX 다듬기 (사이드바 토글, 세션 인터럽트, 3-level 계층) ← 현재**
- [ ] Phase 3 — TBD (아래 "다음에 고민할 것들" 참조)

## 다음에 고민할 것들

[docs/next-steps.md](docs/next-steps.md) 참조.

## 라이선스

MIT
