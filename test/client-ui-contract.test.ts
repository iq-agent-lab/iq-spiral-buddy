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

  test("sidebar search has a visible label and query-only result status", () => {
    assert.match(html, /aria-labelledby="sidebar-search-title"/);
    assert.match(html, /id="sidebar-search-title">목차 검색/);
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
    assert.match(brandCss, /\.chapter-item--completed::before/);
    assert.match(brandCss, /\.chapter-item--upcoming/);
    assert.match(brandCss, /@media \(hover: none\), \(pointer: coarse\)/);
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
