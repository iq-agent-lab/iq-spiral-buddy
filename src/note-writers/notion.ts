/**
 * Notion target — DB에 페이지 생성, frontmatter→properties, body→blocks.
 *
 * 사용자 준비:
 * 1. https://www.notion.so/my-integrations 에서 integration 생성
 * 2. SPIRAL_NOTION_TOKEN에 그 token
 * 3. 노트 저장할 Notion DB 생성 (또는 기존 DB 사용)
 * 4. DB의 "Add connections"에서 위 integration 추가 (권한 부여)
 * 5. DB id를 SPIRAL_NOTION_DATABASE_ID에 — DB URL의 `?v=...` 앞부분 32자
 *
 * DB property 권장 구조 (없는 property는 그냥 무시됨, title은 필수):
 *   - Name (title) [필수]
 *   - Date (date)
 *   - Depth (number)
 *   - Roadmap (select)
 *   - Chapter ID (rich_text)
 *   - Tags (multi_select)
 *   - Summary (rich_text)
 */

import { Client } from "@notionhq/client";
import { markdownToBlocks } from "@tryfabric/martian";
import type { NewNote } from "../vault.js";
import type { Config } from "../config.js";
import type { NoteWriteResult } from "./index.js";

// Notion 제약
const NOTION_TITLE_MAX = 200;
const NOTION_TEXT_MAX = 2000;
const NOTION_CHILDREN_PER_REQUEST = 100; // page.create 시 children 100개까지
const NOTION_APPEND_BATCH = 100;

export async function writeNotionNote(
  config: Config,
  note: NewNote,
): Promise<NoteWriteResult> {
  if (!config.notionToken || !config.notionDatabaseId) {
    throw new Error(
      "Notion target requires SPIRAL_NOTION_TOKEN and SPIRAL_NOTION_DATABASE_ID",
    );
  }

  const notion = new Client({ auth: config.notionToken });

  // DB의 properties 조회 → 우리가 채울 수 있는 것만 매핑 (다른 건 무시)
  const dbInfo = await notion.databases.retrieve({
    database_id: config.notionDatabaseId,
  });
  const dbProps = dbInfo.properties as Record<
    string,
    { type: string; id: string }
  >;

  // Title property는 무조건 하나 있음 (Notion DB 제약). 그 이름 찾기.
  const titlePropName = Object.entries(dbProps).find(
    ([, def]) => def.type === "title",
  )?.[0];
  if (!titlePropName) {
    throw new Error(
      `Notion DB ${config.notionDatabaseId} has no title property`,
    );
  }

  // 채울 properties 구성 — 해당 type이 DB에 있을 때만 추가
  const date = new Date().toISOString().slice(0, 10);
  const properties: Record<string, unknown> = {};

  // Title (필수)
  properties[titlePropName] = {
    title: [
      {
        type: "text",
        text: { content: truncate(note.topic, NOTION_TITLE_MAX) },
      },
    ],
  };

  // 표준 property들 — 있으면 채우고, 없으면 skip
  setPropIfMatches(properties, dbProps, "Date", "date", {
    date: { start: date },
  });
  setPropIfMatches(properties, dbProps, "Depth", "number", {
    number: note.depth,
  });
  setPropIfMatches(properties, dbProps, "Roadmap", "select", {
    select: note.roadmapName
      ? { name: truncate(note.roadmapName, 100) }
      : null,
  });
  setPropIfMatches(properties, dbProps, "Chapter ID", "rich_text", {
    rich_text: note.chapterId
      ? [{ type: "text", text: { content: note.chapterId } }]
      : [],
  });
  setPropIfMatches(properties, dbProps, "Tags", "multi_select", {
    multi_select: note.tags
      .slice(0, 50)
      .map((t) => ({ name: truncate(t, 100) })),
  });
  setPropIfMatches(properties, dbProps, "Summary", "rich_text", {
    rich_text: [
      {
        type: "text",
        text: { content: truncate(note.summary, NOTION_TEXT_MAX) },
      },
    ],
  });

  // 본문: markdown → Notion blocks
  // martian이 알아서 heading/paragraph/list/code/quote 변환
  const bodyWithTitle = `# ${note.topic}\n\n${note.body}`;
  let blocks: any[];
  try {
    blocks = markdownToBlocks(bodyWithTitle);
  } catch (err) {
    // 변환 실패 시 plain paragraph 하나로 fallback
    blocks = [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: truncate(bodyWithTitle, NOTION_TEXT_MAX) },
            },
          ],
        },
      },
    ];
  }

  // 첫 100개는 page.create의 children으로, 나머지는 blocks.children.append로
  const firstBatch = blocks.slice(0, NOTION_CHILDREN_PER_REQUEST);
  const remaining = blocks.slice(NOTION_CHILDREN_PER_REQUEST);

  const page = await notion.pages.create({
    parent: { database_id: config.notionDatabaseId },
    properties: properties as any,
    children: firstBatch as any,
  });

  // 나머지 blocks 추가 (100개씩 batch)
  for (let i = 0; i < remaining.length; i += NOTION_APPEND_BATCH) {
    const batch = remaining.slice(i, i + NOTION_APPEND_BATCH);
    await notion.blocks.children.append({
      block_id: page.id,
      children: batch as any,
    });
    // rate limit 보호 — 3 req/s 제한이라 살짝 쉬어주기
    await sleep(350);
  }

  // page URL은 응답에 있음
  const pageUrl =
    "url" in page && typeof page.url === "string" ? page.url : null;

  return {
    target: "notion",
    identifier: page.id,
    externalUrl: pageUrl,
    metadata: {
      pageId: page.id,
      databaseId: config.notionDatabaseId,
      blockCount: blocks.length,
    },
  };
}

function setPropIfMatches(
  target: Record<string, unknown>,
  dbProps: Record<string, { type: string }>,
  propName: string,
  expectedType: string,
  value: unknown,
) {
  // 정확히 일치하는 이름의 property가 있고 타입이 맞으면 채움
  if (dbProps[propName]?.type === expectedType) {
    target[propName] = value;
    return;
  }
  // 대소문자 무시 매칭도 시도
  const altName = Object.keys(dbProps).find(
    (k) => k.toLowerCase() === propName.toLowerCase(),
  );
  if (altName && dbProps[altName]?.type === expectedType) {
    target[altName] = value;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
