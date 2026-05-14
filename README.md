# iq-spiral-buddy

> Spiral learning companion that bridges Claude and Obsidian. Local web app.

학습 로드맵을 기반으로 Claude와 학습 세션을 진행하고, 그 결과를 옵시디언에 **나선형 구조로 자동 축적**하는 로컬 웹앱. `pnpm dev` 치면 브라우저가 자동으로 열리고, 다음 세션엔 이전 노트가 자동 컨텍스트로 들어가서 "어디까지 했더라"를 매번 다시 만들 필요가 없다.

## 무엇이 다른가

옵시디언 + AI 도구는 이미 많다. `iq-spiral-buddy`의 세 가지 차별점:

1. **로드맵 주도(Roadmap-driven)** — vault 안에서 채팅하는 게 아니라, 외부 학습 커리큘럼(레포의 README나 챕터 디렉토리)을 1급 시민으로 다룬다. "오늘 뭐 배울까"를 도구가 제안한다.
2. **나선형 감지(Spiral detection)** — 새 세션 시작 시 이전 노트를 스캔해 어떤 챕터를 한 번 더 깊게 볼지, 새로 진도 나갈지, 이전 학습과 연결지을지 Claude가 판단한다.
3. **세션 후 구조화(Structured exhaust)** — 대화 로그를 통째로 노트로 만드는 게 아니라, 정해진 8-섹션 템플릿(요약 / 핵심 개념 / 직관 / 헷갈렸던 점 / 다음에 볼 것 등)에 맞춰 Claude가 정리한다.

## Status

🚧 **Phase 2 — Curated GitHub source**

세 가설을 검증하는 단계:
- 로드맵 주도 세션이 그냥 채팅보다 학습 효과가 있는가
- 자동 생성된 노트가 나중에 다시 봤을 때 쓸 만한가
- 나선형 감지가 의미 있는 연결을 찾아내는가

새로 추가된 차원: **다른 사람도 spiral-buddy 깃클론만으로 즉시 학습 시작 가능** — iq-dev-lab의 deep-dive 시리즈가 디폴트로 노출되고, 클릭 시 on-demand 클론된다.

자세한 건 [docs/phase-2-curated.md](docs/phase-2-curated.md), [docs/phase-1.5-dynamic-roadmaps.md](docs/phase-1.5-dynamic-roadmaps.md).

## 설치

```bash
git clone https://github.com/iq-agent-lab/iq-spiral-buddy
cd iq-spiral-buddy
pnpm install
cp .env.example .env
# .env 열어서 ANTHROPIC_API_KEY, SPIRAL_VAULT_PATH 입력
# SPIRAL_ROADMAP_ROOT는 빈 칸으로 둬도 OK — iq-dev-lab의 38+개 학습 레포가 디폴트로 노출됨
```

요구사항: Node.js 20+, [Anthropic API 키](https://console.anthropic.com/), [Obsidian](https://obsidian.md/) vault.

## 사용

```bash
pnpm dev
```

이게 끝. 자동으로:
1. 서버가 `http://localhost:3737`에 뜸
2. 브라우저 자동으로 열림
3. 좌측 사이드바 상단에 **로드맵 셀렉터** — 두 가지 source 노출:
   - 📁 **Local** — `SPIRAL_ROADMAP_ROOT` 아래 자동 탐지 (개인 자료)
   - 📚 **Curated** — `iq-dev-lab` 조직의 38+개 deep-dive 시리즈 (받기 가능 토글)
4. Curated 레포 "📥 받기" 클릭 → on-demand `git clone --depth=1` → 자동으로 학습 시작 가능
5. 챕터 클릭하거나 "Start with this" 누르면 세션 시작
6. 대화 끝나면 `/end` 버튼 → 옵시디언에 노트 자동 생성/저장 (frontmatter에 `roadmap_id` 기록)

마지막으로 선택한 로드맵은 브라우저 localStorage에 저장되어 다음 부팅 시 복원된다.

브라우저 자동 오픈이 싫으면 `.env`에 `NO_OPEN=1` 추가.

### 단축키
- `Enter`: 메시지 전송
- `Shift + Enter`: 줄바꿈

### 버튼
- `/quiz` — Claude가 짧은 자가확인 질문 던짐
- `/end` — 세션 종료 + 노트 생성/저장 + history 갱신

## 환경변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 (웹앱 전용 — MCP는 Claude Desktop 자체 인증 사용) | (필수) |
| `SPIRAL_VAULT_PATH` | 옵시디언 vault 루트 (또는 그 하위 폴더 — `.obsidian/` 자동 탐지됨) | (필수) |
| `SPIRAL_ROADMAP_ROOT` | 로컬 로드맵 root 디렉토리 (Local source). 미설정이면 Curated만 사용. | (선택) |
| `SPIRAL_ROADMAP_PATH` | (legacy) 단일 로드맵만 강제 지정. 설정 시 다른 로컬 로드맵은 안 보임. | (선택) |
| `SPIRAL_CURATED_ORG` | Curated source의 GitHub 조직 이름 | `iq-dev-lab` |
| `SPIRAL_DISABLE_CURATED` | `1`로 설정하면 Curated source 완전 꺼짐 (Local만 사용) | (off) |
| `SPIRAL_GITHUB_TOKEN` | GitHub API 호출 시 인증 토큰. unauth 60 req/hr → auth 5000 req/hr | (선택) |
| `SPIRAL_VAULT_NAME` | 옵시디언에 등록된 vault 이름 (폴더명과 다를 때만) | 자동 탐지 |
| `SPIRAL_MODEL` | Claude 모델 id | `claude-sonnet-4-6` |
| `SPIRAL_MAX_TOKENS` | 응답당 최대 토큰 | `4096` |
| `PORT` | 웹서버 포트 | `3737` |
| `NO_OPEN` | `1`로 설정하면 브라우저 자동 오픈 안 함 | (off) |

### Local vs Curated 로드맵

**Local** — 사용자의 로컬 디렉토리(`SPIRAL_ROADMAP_ROOT`) 아래에서 자동 탐지:
- 로드맵 = README.md를 제외한 `.md` 파일이 2개 이상 직접 들어있는 디렉토리
- 최대 깊이 6단계까지 재귀 탐색
- 로드맵으로 인식된 디렉토리 안은 더 탐색하지 않음

**Curated** — GitHub 조직의 public 레포 (기본 `iq-dev-lab`):
- 처음엔 목록만 GitHub API로 가져옴 (1시간 캐시)
- "📥 받기" 클릭 시 on-demand `git clone --depth=1`로 `.cache/curated/<org>/<repo>/`에 캐시
- archived/fork/private/0byte 레포는 자동 제외
- 한 레포가 여러 sub-roadmap을 포함할 수 있음 (예: `spring-core-deep-dive`의 `ioc-container/`, `transaction-mvcc/`)
- id는 `curated:<org>/<repo>[/<sub-path>]` prefix로 Local과 구분

## Claude Desktop (MCP) 통합

웹앱과 별개로 Claude Desktop에서도 spiral-buddy를 도구로 사용할 수 있다. 같은 코어(roadmap/vault) 공유.

### 설정

`~/Library/Application Support/Claude/claude_desktop_config.json` 파일을 열어서 (없으면 새로 생성):

```json
{
  "mcpServers": {
    "iq-spiral-buddy": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/ibm514/iq-lab/iq-agent-lab/iq-spiral-buddy/src/mcp.ts"
      ]
    }
  }
}
```

경로는 본인 환경에 맞게 수정. `.env`는 패키지 루트에서 자동으로 로드되므로 별도 환경변수 설정 불필요 (단 `ANTHROPIC_API_KEY`는 MCP에선 안 씀 — Claude Desktop이 자체 인증).

Claude Desktop을 재시작하면 입력창 도구 아이콘에서 `iq-spiral-buddy` 도구 5개가 보임.

### 사용

자연어로 요청하면 됨. Claude가 적절한 도구를 순서대로 호출함:

> "spiral-buddy로 학습할 만한 로드맵 뭐 있어?"
→ Claude가 `spiral_list_roadmaps` 호출 → 표 형식으로 모든 로드맵 + 진도 보여줌

> "transaction-mvcc 로드맵의 ACID 챕터 deeper-layer로 가자"
→ `spiral_list_chapters({roadmap_id: "transaction-mvcc"})` → `spiral_get_chapter_context({roadmap_id, chapter_id: "01-acid.md"})` → 학습 대화 → `spiral_save_note`

> "redis 학습한 노트들 보여줘"
→ `spiral_list_notes({roadmap_id: "redis-deep-dive"})`

### 등록된 도구 (7개)

- `spiral_list_roadmaps` — Local + Curated 통합 표시. `include_available=true`로 미설치 큐레이션 레포도 함께 볼 수 있음.
- `spiral_install_curated` — **[Phase 2 신규]** GitHub 조직 레포 on-demand 클론
- `spiral_list_chapters` — 특정 로드맵의 챕터 + 학습 진도 (`roadmap_id` 인자)
- `spiral_get_chapter_context` — 챕터 본문 + 이전 노트 (세션 시작용)
- `spiral_list_notes` — 과거 노트 인덱스 (로드맵별 필터 가능)
- `spiral_read_note` — 특정 노트 본문 읽기
- `spiral_save_note` — 8섹션 구조화 노트 저장 (누락 섹션 자동 보충)

모든 도구의 응답은 **풍부한 마크다운**으로 반환됨. Claude Desktop이 표/리스트를 그대로 렌더링하므로 별도 가공 없이 사용자에게 보여줄 수 있다.

### 웹앱 vs MCP, 언제 뭘 쓰나

- **웹앱** (`pnpm dev`) — 한 챕터를 집중해서 깊게 파고들 때. 챕터 사이드바, 진도 뱃지, 마크다운/코드 렌더링이 차별점.
- **MCP** (Claude Desktop) — Claude와 자연스럽게 chat하다가 spiral-buddy 데이터를 참조/저장하고 싶을 때. 다른 작업 중간에 가볍게 끼워 쓸 때.

## 출력되는 노트 구조

vault에 이렇게 저장된다:

```
<vault>/
  spiral-buddy/
    _index.md                                      ← 모든 세션 인덱스
    2026-05-13-memory-model-d1.md                  ← depth 1 (첫 학습)
    2026-05-20-memory-model-d2.md                  ← 같은 주제 깊게 (depth 2)
    2026-05-22-replication-d1.md
```

각 노트의 구조:

```yaml
---
title: "ACID"
topic: "ACID"
date: 2026-05-13
depth: 1
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
## 핵심 개념
## 직관 / 비유
## 짚고 넘어간 예제
## 헷갈렸던 / 확인이 필요한 지점     ← 다음 세션의 진입점
## 이전 학습과의 연결
## 다음에 볼 것
```

> "헷갈렸던 / 확인이 필요한 지점" 섹션이 이 도구의 심장이다. 다음 나선 회기 때 Claude가 가장 먼저 보는 곳.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Browser (vanilla JS + marked + highlight.js via CDN)  │
│   ↕ fetch + streaming response body                    │
│  Hono server on localhost:3737                          │
│   ├ /api/roadmaps                                       │
│   ├ /api/chapters?roadmap_id=...                        │
│   ├ /api/history?roadmap_id=...                         │
│   ├ /api/suggest?roadmap_id=...                         │
│   ├ /api/session/{start, message, end}                  │
│   └ static client files                                 │
│   ↕ in-process modules                                  │
│  roadmap.ts → discoverRoadmaps(<ROADMAP_ROOT>)         │
│  vault.ts → reads/writes <VAULT>/spiral-buddy/          │
│  spiral.ts → Claude judges next chapter (per roadmap)   │
│  note-writer.ts → 8-section structuring + validation    │
│  claude.ts → Anthropic SDK wrapper                      │
│                                                          │
│  mcp.ts (separate entry) ──────────────► Claude Desktop │
│   stdio transport · 6 tools · markdown-first responses  │
└─────────────────────────────────────────────────────────┘
```

빌드 파이프라인 없음. 클라이언트는 ES 모듈을 브라우저가 직접 로드. tsx가 서버 TS를 그 자리에서 실행.

## 로드맵 (도구의)

- [x] Phase 0 — CLI 프로토타입 (폐기)
- [x] Phase 0.5 — 로컬 웹앱 MVP
- [x] Phase 1 — MCP 서버 + Claude Desktop 통합
- [x] Phase 1.5 — 동적 로드맵 선택 + MCP 마크다운 응답
- [x] **Phase 2 — Curated GitHub source (현재)** ← 여기
- [ ] Phase 3 — Tauri standalone 패키징 또는 Obsidian 플러그인

## License

MIT
