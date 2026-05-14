import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";

/**
 * 로드맵 식별 체계:
 * - roadmap_id : root 기준 상대경로 (글로벌 unique, e.g. "spring ecosystem/spring-core-deep-dive/transaction-mvcc")
 * - roadmap_name : basename (표시용, e.g. "transaction-mvcc")
 * - chapter_id : roadmap 내부 경로 (e.g. "01-acid.md")
 * - 글로벌 챕터 식별 : (roadmap_id, chapter_id) 튜플
 */

export interface Roadmap {
  /** root-relative path (Local) 또는 "curated:org/repo[/subpath]" (Curated) */
  id: string;
  /** basename - 표시용 */
  name: string;
  /** 절대 경로 */
  absolutePath: string;
  /** README.md 제외한 직접 .md 파일 수 */
  chapterCount: number;
  /** 소스 종류 (Phase 2). 명시 안 됨 = local (backward compat) */
  source?: "local" | "curated";
}

export interface Chapter {
  /** roadmap 내부 경로 (e.g. "01-acid.md", "subdir/02-foo.md") */
  id: string;
  /** 소속 로드맵 id (root-relative path) */
  roadmapId: string;
  /** 소속 로드맵 표시 이름 (basename) */
  roadmapName: string;
  title: string;
  filePath: string;
  content: string;
  frontmatter: Record<string, unknown>;
  order: number;
}

const IGNORE_PATTERNS = ["node_modules/**", ".git/**", ".obsidian/**"];
const MAX_DEPTH = 6;
const MIN_CHAPTERS = 2;

/**
 * root 디렉토리 아래에서 로드맵 후보들을 모두 찾는다.
 * 로드맵 = README.md를 제외한 .md 파일이 MIN_CHAPTERS개 이상 직접 들어있는 디렉토리.
 * 로드맵으로 인식된 디렉토리 내부는 더 깊이 탐색하지 않는다.
 */
export async function discoverRoadmaps(rootPath: string): Promise<Roadmap[]> {
  const stat = await fs.stat(rootPath).catch(() => null);
  if (!stat?.isDirectory()) return [];

  const roadmaps: Roadmap[] = [];
  await walk(rootPath, rootPath, 0, roadmaps);
  roadmaps.sort((a, b) => a.id.localeCompare(b.id));
  return roadmaps;
}

async function walk(
  rootPath: string,
  currentDir: string,
  depth: number,
  out: Roadmap[],
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  // 직접 들어있는 .md 파일 수 (README.md 제외)
  const directMdFiles = entries.filter(
    (e) =>
      e.isFile() &&
      e.name.toLowerCase().endsWith(".md") &&
      e.name.toLowerCase() !== "readme.md",
  );

  if (directMdFiles.length >= MIN_CHAPTERS) {
    const id =
      currentDir === rootPath
        ? path.basename(currentDir)
        : path.relative(rootPath, currentDir);
    out.push({
      id,
      name: path.basename(currentDir),
      absolutePath: currentDir,
      chapterCount: directMdFiles.length,
    });
    return;
  }

  // 로드맵이 아니면 하위 디렉토리들 탐색
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    await walk(rootPath, path.join(currentDir, entry.name), depth + 1, out);
  }
}

/**
 * 특정 로드맵의 챕터 목록을 로드.
 * chapter_id는 roadmap 내부 상대경로.
 */
export async function loadRoadmapChapters(
  roadmap: Roadmap,
): Promise<Chapter[]> {
  const files = await glob("**/*.md", {
    cwd: roadmap.absolutePath,
    ignore: IGNORE_PATTERNS,
    nodir: true,
  });

  const filtered = files.filter(
    (f) => path.basename(f).toLowerCase() !== "readme.md",
  );
  const sorted = filtered.sort((a, b) => naturalCompare(a, b));

  const chapters: Chapter[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rel = sorted[i]!;
    const abs = path.join(roadmap.absolutePath, rel);
    const ch = await loadChapterFile(abs, roadmap, rel);
    ch.order = i;
    chapters.push(ch);
  }
  return chapters;
}

async function loadChapterFile(
  abs: string,
  roadmap: Roadmap,
  relativeToRoadmap: string,
): Promise<Chapter> {
  const raw = await fs.readFile(abs, "utf-8");
  const parsed = matter(raw);

  const fmTitle =
    typeof parsed.data.title === "string" ? parsed.data.title : null;
  const firstHeading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fallback = path.basename(abs, ".md");
  const title = fmTitle ?? firstHeading ?? fallback;

  return {
    id: relativeToRoadmap,
    roadmapId: roadmap.id,
    roadmapName: roadmap.name,
    title,
    filePath: abs,
    content: parsed.content.trim(),
    frontmatter: parsed.data as Record<string, unknown>,
    order: 0,
  };
}

/**
 * roadmap_id로 특정 로드맵 찾기.
 * 정확 일치 → 없으면 basename fallback 매칭.
 */
export async function findRoadmap(
  rootPath: string,
  roadmapId: string,
): Promise<Roadmap | null> {
  const all = await discoverRoadmaps(rootPath);
  const exact = all.find((r) => r.id === roadmapId);
  if (exact) return exact;
  const byName = all.find((r) => r.name === roadmapId);
  return byName ?? null;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function pathExists(p: string | null): p is string {
  return p !== null && fsSync.existsSync(p);
}
