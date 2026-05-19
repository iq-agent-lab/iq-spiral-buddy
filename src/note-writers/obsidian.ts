/**
 * Obsidian target — vault 디렉토리에 markdown 파일 작성.
 * 실제 파일 쓰기는 vault.writeNewNote가 담당, 여기선 thin wrapper.
 */

import path from "node:path";
import { writeNewNote, type NewNote } from "../vault.js";
import type { Config } from "../config.js";
import type { NoteWriteResult } from "./index.js";

export async function writeObsidianNote(
  config: Config,
  note: NewNote,
  options: { category?: string | null } = {},
): Promise<NoteWriteResult> {
  if (!config.vaultPath) {
    throw new Error("Obsidian target requires SPIRAL_VAULT_PATH");
  }

  const result = await writeNewNote(config.vaultPath, note, {
    layout: config.noteLayout,
    category: options.category ?? null,
  });

  // obsidian:// URI 생성 (vault 이름 알면)
  let externalUrl: string | null = null;
  if (config.vaultName) {
    const root = config.obsidianVaultRoot ?? config.vaultPath;
    const relToVault = path
      .relative(root, result.absolutePath)
      .replace(/\.md$/, "");
    externalUrl = `obsidian://open?vault=${encodeURIComponent(config.vaultName)}&file=${encodeURIComponent(relToVault)}`;
  }

  return {
    target: "obsidian",
    identifier: result.absolutePath,
    externalUrl,
    metadata: {
      absolutePath: result.absolutePath,
      relativePath: result.relativePath,
      folderRelativePath: result.folderRelativePath,
    },
  };
}
