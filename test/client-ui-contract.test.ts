import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, brandCss] = await Promise.all([
  readFile(new URL("../client/index.html", import.meta.url), "utf8"),
  readFile(new URL("../client/app.js", import.meta.url), "utf8"),
  readFile(new URL("../client/blue-brand.css", import.meta.url), "utf8"),
]);

describe("client UI contracts", () => {
  test("workspace management lives in Settings, not the primary sidebar", () => {
    assert.doesNotMatch(html, /id="workspace-section"/);
    assert.match(html, /data-panel="workspaces"/);
    assert.match(html, /id="settings-workspace-active-name"/);
    assert.doesNotMatch(app, /renderWorkspaceSelector/);
    const initSettings = app.slice(
      app.indexOf("async function initSettings()"),
      app.indexOf("// v0.5.32+ — 업데이트 banner"),
    );
    assert.ok(
      initSettings.indexOf('addEventListener("click", openSettingsModal)') <
        initSettings.indexOf("await getSettingsWithTimeout()"),
      "the Settings button must be wired before the initial IPC request",
    );
    assert.match(app, /function getSettingsWithTimeout\(timeoutMs = 8_000\)/);
    assert.match(html, /id="settings-load-state"[^>]*aria-live="polite"/);
    assert.match(app, /element\.inert = blocked/);
    assert.match(app, /setSettingsLoadState\("loading"\)/);
  });

  test("sidebar search is self-evident without a repeated heading", () => {
    assert.match(
      html,
      /class="sidebar-search-section" role="search" aria-label="목차 검색"/,
    );
    assert.doesNotMatch(html, /id="sidebar-search-title"/);
    assert.match(html, /aria-controls="roadmap-list chapter-list"/);
    assert.match(html, /id="sidebar-search-meta"[^>]*aria-live="polite"/);
    assert.doesNotMatch(html, /입력하는 즉시 학습 목록을 좁혀요/);
    assert.doesNotMatch(app, /입력하는 즉시 학습 목록을 좁혀요/);
    assert.match(brandCss, /\.sidebar-search-wrap:focus-within/);
    assert.ok(
      (app.match(/cancelPending\(\);/g) ?? []).length >= 3,
      "typing, Escape and the clear button must cancel stale debounce work",
    );
    assert.match(
      app,
      /classList\.contains\("sidebar-collapsed"\)[\s\S]*?sidebarToggle\?\.click\(\)/,
    );
  });

  test("the welcome screen no longer repeats the edition kicker", () => {
    assert.doesNotMatch(html, /SPIRAL · BLUE/);
    assert.doesNotMatch(app, /SPIRAL · BLUE/);
    assert.match(html, /배움은 돌아올수록 깊어진다\./);
    assert.match(app, /배움은 돌아올수록 깊어진다\./);
    assert.doesNotMatch(html, /오늘의 깊이를 선택하세요/);
    assert.doesNotMatch(app, /오늘의 깊이를 선택하세요/);
    assert.doesNotMatch(html, /welcome-steps/);
  });

  test("chapter progress separates current, completed, upcoming and recent", () => {
    assert.match(app, /state\.session\?\.chapterId \?\? null/);
    assert.match(
      app,
      /const progressState = isActive[\s\S]*?"current"[\s\S]*?"completed"[\s\S]*?"upcoming"/,
    );
    assert.match(app, /li\.classList\.add\(`chapter-item--\$\{progressState\}`\)/);
    assert.match(app, /class="chapter-last-badge"/);
    assert.match(app, /b\.modifiedAt \?\? b\.date/);
    assert.match(app, /class="chapter-actions-toggle"/);
    assert.match(app, /--chapter-step-tone/);
    assert.match(app, /chapter-item--roadmap-complete/);
    assert.match(app, /chapter-item--journey-complete/);
    assert.match(brandCss, /\.chapter-item--completed::before/);
    assert.match(brandCss, /\.chapter-item--upcoming/);
    assert.match(brandCss, /\.chapter-item--journey-complete/);
    assert.match(brandCss, /var\(--blue-success\)/);
    assert.match(
      brandCss,
      /\.chapter-item--completed:not\(\.chapter-item--active\)[\s\S]*?\.num \{[\s\S]*?color: var\(--blue-cobalt-strong\) !important;/,
    );
    assert.match(brandCss, /@media \(hover: none\), \(pointer: coarse\)/);
  });

  test("sidebar headings, chapter menu and activity footer stay visually flat", () => {
    assert.match(
      brandCss,
      /#sidebar h2::after,[\s\S]*?content: none !important;/,
    );
    assert.match(app, /<span class="chapter-action-label">미리보기<\/span>/);
    assert.match(app, /<span class="chapter-action-label">노트 열기<\/span>/);
    assert.match(app, /<span class="chapter-action-label">노트 삭제<\/span>/);
    assert.match(
      brandCss,
      /\.chapter-item:has\(\.chapter-actions\.actions-open\) \{[\s\S]*?z-index: 20;/,
    );
    assert.match(
      brandCss,
      /#sidebar[\s\S]*?> \.trash-section[\s\S]*?padding: 0 !important;/,
    );
    assert.match(
      brandCss,
      /> \.trash-section[\s\S]*?> \.trash-open-btn[\s\S]*?border: 0 !important;/,
    );
    assert.match(
      brandCss,
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.chapter-item:hover \.chapter-meta,[\s\S]*?display: inline-flex;/,
    );
  });

  test("the session depth badge stays attached to its chapter title", () => {
    assert.match(
      app,
      /<strong class="topbar-chapter-title"[\s\S]*?<span class="depth">depth \$\{state\.session\.depth\}<\/span>/,
    );
    assert.match(
      brandCss,
      /\.topbar-chapter-title \{[\s\S]*?flex: 0 1 auto;/,
    );
    assert.match(
      brandCss,
      /#current-chapter \.depth \{[\s\S]*?margin-left: 0 !important;/,
    );
  });

  test("history details are disclosed on demand with explicit actions", () => {
    assert.match(app, /<details class="history-disclosure">/);
    assert.match(app, /history-conversation-btn/);
    assert.match(app, /class="history-date"/);
    assert.doesNotMatch(app, /li\.setAttribute\("role", "button"\)/);
    assert.match(brandCss, /cursor: default !important/);
  });

  test("user labels and content share a stable right-aligned reading row", () => {
    assert.match(
      brandCss,
      /\.messages \.message\.user \{[\s\S]*?display: grid !important;[\s\S]*?justify-items: end;/,
    );
    assert.match(
      brandCss,
      /\.message\.user \.content \{[\s\S]*?width: fit-content !important;[\s\S]*?justify-self: end;/,
    );
  });
});
