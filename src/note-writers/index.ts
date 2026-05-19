/**
 * 노트 저장 추상화. 노트는 여러 target(Obsidian 파일, Notion DB 페이지 등)에
 * 동시에 저장될 수 있다.
 *
 * 새 target 추가 = 새 NoteWriter 구현 + dispatchToTargets에 분기 추가.
 */

import type { NewNote } from "../vault.js";
import type { Config } from "../config.js";

export interface NoteWriteResult {
  /** 어떤 target에 저장됐는지 */
  target: "obsidian" | "notion";
  /** 표시용 식별자 — Obsidian: 파일 경로, Notion: page id */
  identifier: string;
  /** 사람이 클릭해서 열 수 있는 URL/URI */
  externalUrl: string | null;
  /** 추가 정보 (UI 표시용) */
  metadata?: Record<string, unknown>;
}

/**
 * Writer 진행 상황을 호출자에게 push하기 위한 callback.
 * stage는 "writing-obsidian" 또는 "saving-notion" 같이.
 */
export type ProgressCallback = (event: {
  target: "obsidian" | "notion";
  phase: "start" | "done";
  detail: string;
}) => Promise<void>;

export interface DispatchOptions {
  /** 진행 콜백 (SSE 등 streaming 가능) */
  onProgress?: ProgressCallback;
  /** Obsidian 폴더 결정 시 category로 사용할 값 */
  obsidianCategory?: string | null;
}

/**
 * config.noteTargets에 따라 적절한 writer들로 dispatch.
 * 한 target이 실패해도 다른 target은 계속 시도 (best-effort).
 * 모든 결과를 results 배열로 반환, 에러는 errors 배열로.
 */
export async function dispatchToTargets(
  config: Config,
  note: NewNote,
  options: DispatchOptions = {},
): Promise<{
  results: NoteWriteResult[];
  errors: Array<{ target: "obsidian" | "notion"; message: string }>;
}> {
  const results: NoteWriteResult[] = [];
  const errors: Array<{ target: "obsidian" | "notion"; message: string }> = [];

  for (const target of config.noteTargets) {
    try {
      if (target === "obsidian") {
        await options.onProgress?.({
          target: "obsidian",
          phase: "start",
          detail: "Obsidian vault에 파일 작성",
        });
        const { writeObsidianNote } = await import("./obsidian.js");
        const result = await writeObsidianNote(config, note, {
          category: options.obsidianCategory ?? null,
        });
        results.push(result);
        await options.onProgress?.({
          target: "obsidian",
          phase: "done",
          detail: result.metadata?.relativePath as string,
        });
      } else if (target === "notion") {
        await options.onProgress?.({
          target: "notion",
          phase: "start",
          detail: "Notion DB에 페이지 생성",
        });
        const { writeNotionNote } = await import("./notion.js");
        const result = await writeNotionNote(config, note);
        results.push(result);
        await options.onProgress?.({
          target: "notion",
          phase: "done",
          detail: result.externalUrl ?? result.identifier,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ target, message });
    }
  }

  return { results, errors };
}
