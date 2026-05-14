import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";

export interface SpiralNote {
  filePath: string;
  relativePath: string;
  title: string;
  topic: string;
  chapterId: string | null;
  /** 신규 스키마: roadmap의 root-relative path. 옛 노트는 null. */
  roadmapId: string | null;
  /** roadmap basename (표시용). 옛 노트도 보유. */
  roadmapName: string | null;
  date: string;
  depth: number;
  tags: string[];
  summary: string;
  body: string;
}

const SPIRAL_DIR = "spiral-buddy";

export async function listSpiralNotes(
  vaultPath: string,
): Promise<SpiralNote[]> {
  const spiralRoot = path.join(vaultPath, SPIRAL_DIR);
  try {
    await fs.access(spiralRoot);
  } catch {
    return [];
  }

  const files = await glob("**/*.md", {
    cwd: spiralRoot,
    ignore: ["_index.md"],
    nodir: true,
  });

  const notes: SpiralNote[] = [];
  for (const rel of files) {
    const abs = path.join(spiralRoot, rel);
    const note = await readNote(abs, rel);
    if (note) notes.push(note);
  }
  notes.sort((a, b) => b.date.localeCompare(a.date));
  return notes;
}

async function readNote(
  abs: string,
  relativePath: string,
): Promise<SpiralNote | null> {
  try {
    const raw = await fs.readFile(abs, "utf-8");
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    return {
      filePath: abs,
      relativePath,
      title:
        (fm.title as string | undefined) ??
        path.basename(abs, ".md"),
      topic:
        (fm.topic as string | undefined) ??
        (fm.title as string | undefined) ??
        path.basename(abs, ".md"),
      chapterId: (fm.chapter_id as string | undefined) ?? null,
      roadmapId: (fm.roadmap_id as string | undefined) ?? null,
      roadmapName: (fm.roadmap as string | undefined) ?? null,
      date: formatDate(fm.date),
      depth: typeof fm.depth === "number" ? fm.depth : 1,
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      summary: (fm.summary as string | undefined) ?? "",
      body: parsed.content.trim(),
    };
  } catch {
    return null;
  }
}

export interface NewNote {
  topic: string;
  chapterId: string | null;
  /** 신규: roadmap root-relative path */
  roadmapId: string | null;
  roadmapName: string | null;
  depth: number;
  tags: string[];
  summary: string;
  body: string;
  relatedNotePaths: string[];
}

export async function writeNewNote(
  vaultPath: string,
  note: NewNote,
): Promise<string> {
  const spiralRoot = path.join(vaultPath, "spiral-buddy");
  await fs.mkdir(spiralRoot, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(note.topic);
  const fileName = `${date}-${slug}-d${note.depth}.md`;
  const filePath = path.join(spiralRoot, fileName);

  const frontmatter = [
    "---",
    `title: "${escapeYaml(note.topic)}"`,
    `topic: "${escapeYaml(note.topic)}"`,
    `date: ${date}`,
    `depth: ${note.depth}`,
    note.chapterId ? `chapter_id: "${escapeYaml(note.chapterId)}"` : null,
    note.roadmapName ? `roadmap: "${escapeYaml(note.roadmapName)}"` : null,
    note.roadmapId ? `roadmap_id: "${escapeYaml(note.roadmapId)}"` : null,
    `tags: [${note.tags.map((t) => `"${escapeYaml(t)}"`).join(", ")}]`,
    `summary: "${escapeYaml(note.summary)}"`,
    note.relatedNotePaths.length
      ? `related:\n${note.relatedNotePaths.map((p) => `  - "[[${path.basename(p, ".md")}]]"`).join("\n")}`
      : null,
    "generator: iq-spiral-buddy",
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const content = `${frontmatter}\n\n${note.body}\n`;
  await fs.writeFile(filePath, content, "utf-8");

  await updateIndex(spiralRoot, fileName, note);

  return filePath;
}

async function updateIndex(
  spiralRoot: string,
  newFileName: string,
  note: NewNote,
): Promise<void> {
  const indexPath = path.join(spiralRoot, "_index.md");
  const date = new Date().toISOString().slice(0, 10);
  const line = `- ${date} · **${note.topic}** (depth ${note.depth}) → [[${path.basename(newFileName, ".md")}]]`;

  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch {
    existing = [
      "---",
      "title: spiral-buddy index",
      "generator: iq-spiral-buddy",
      "---",
      "",
      "# Sessions",
      "",
    ].join("\n");
  }

  const updated = existing.replace(/(# Sessions\n+)/, `$1${line}\n`);
  const finalContent = updated.includes(line) ? updated : `${existing}\n${line}\n`;
  await fs.writeFile(indexPath, finalContent, "utf-8");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * YAML date 값을 YYYY-MM-DD 형식 문자열로 변환.
 * gray-matter는 ISO 형식 date를 Date 객체로 자동 파싱하므로
 * Date 객체 / 문자열 / undefined 셋 다 처리해야 함.
 */
function formatDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.length > 0) {
    return v.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * 노트가 특정 (roadmapId, chapterId) 챕터를 가리키는지 판단.
 *
 * - 신규 스키마: 노트가 roadmap_id를 가지고 있으면 정확 매칭
 * - 옛 스키마 (roadmap_id 없음): roadmapName이 같고, 노트의 chapter_id가
 *   대상 chapter_id로 끝나거나 같으면 매칭 (옛 노트는 "ioc-container/01-foo.md" 같이
 *   roadmap 이름이 prefix로 붙어있을 수 있음)
 */
export function noteMatchesChapter(
  note: SpiralNote,
  target: { roadmapId: string; roadmapName: string; chapterId: string },
): boolean {
  if (note.roadmapId) {
    return note.roadmapId === target.roadmapId && note.chapterId === target.chapterId;
  }
  // 옛 스키마 fallback
  if (note.roadmapName !== target.roadmapName) return false;
  if (!note.chapterId) return false;
  return (
    note.chapterId === target.chapterId ||
    note.chapterId.endsWith(`/${target.chapterId}`) ||
    note.chapterId === `${target.roadmapName}/${target.chapterId}`
  );
}

/**
 * 노트가 특정 roadmap에 속하는지 판단.
 */
export function noteBelongsToRoadmap(
  note: SpiralNote,
  target: { roadmapId: string; roadmapName: string },
): boolean {
  if (note.roadmapId) {
    return note.roadmapId === target.roadmapId;
  }
  return note.roadmapName === target.roadmapName;
}
