/**
 * Curated 레포의 카테고리 매핑.
 * data/curated-categories.json에서 조직별 분류 정보를 읽는다.
 * 매핑 안 된 레포는 'Other' 카테고리로 묶임.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  "curated-categories.json",
);

export interface CategoryDef {
  name: string;
  emoji: string;
  color: string;
  repos: string[];
}

interface OrgCategoriesEntry {
  categories: CategoryDef[];
}

let _cache: Record<string, OrgCategoriesEntry> | null = null;

async function load(): Promise<Record<string, OrgCategoriesEntry>> {
  if (_cache) return _cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    _cache = JSON.parse(raw);
  } catch {
    _cache = {};
  }
  return _cache!;
}

/**
 * 특정 org에 정의된 카테고리들. 정의 안 됐으면 null.
 */
export async function getOrgCategories(
  org: string,
): Promise<CategoryDef[] | null> {
  const all = await load();
  return all[org]?.categories ?? null;
}

/**
 * 레포 목록을 카테고리별로 그룹화. 카테고리는 정의된 순서 유지.
 * 매핑 안 된 레포는 'Other' 카테고리에 묶임.
 */
export async function groupReposByCategory<T extends { name: string }>(
  org: string,
  repos: T[],
): Promise<Array<{ category: CategoryDef; repos: T[] }>> {
  const defs = await getOrgCategories(org);
  if (!defs || defs.length === 0) {
    return [
      {
        category: {
          name: "All",
          emoji: "📚",
          color: "#888888",
          repos: [],
        },
        repos: [...repos].sort((a, b) => a.name.localeCompare(b.name)),
      },
    ];
  }

  const groups: Array<{ category: CategoryDef; repos: T[] }> = [];
  const usedNames = new Set<string>();

  for (const cat of defs) {
    const matched = repos
      .filter((r) => cat.repos.includes(r.name))
      // README 순서대로 정렬 (카테고리 정의 순서)
      .sort((a, b) => cat.repos.indexOf(a.name) - cat.repos.indexOf(b.name));
    for (const r of matched) usedNames.add(r.name);
    if (matched.length > 0) {
      groups.push({ category: cat, repos: matched });
    }
  }

  const others = repos
    .filter((r) => !usedNames.has(r.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (others.length > 0) {
    groups.push({
      category: {
        name: "Other",
        emoji: "📦",
        color: "#888888",
        repos: [],
      },
      repos: others,
    });
  }

  return groups;
}
