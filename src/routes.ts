import { Hono } from "hono";
import { streamText } from "hono/streaming";
import path from "node:path";

import type { Config } from "./config.js";
import { createClient, streamTurn } from "./claude.js";
import {
  discoverRoadmaps,
  findRoadmap,
  loadRoadmapChapters,
  type Roadmap,
} from "./roadmap.js";
import {
  listSpiralNotes,
  noteBelongsToRoadmap,
  noteMatchesChapter,
  writeNewNote,
} from "./vault.js";
import { suggestNext } from "./spiral.js";
import { generateNote } from "./note-writer.js";
import {
  SESSION_SYSTEM,
  buildInitialContext,
  createSession,
  getSession,
  deleteSession,
} from "./session-store.js";
import {
  listCuratedRepos,
  installCuratedRepo,
  refreshCuratedRepo,
  uninstallCuratedRepo,
  discoverCuratedRoadmaps,
  parseCuratedId,
  type CuratedRepoInfo,
} from "./curated.js";
import {
  groupReposByCategory,
  categorizeLocalRoadmap,
} from "./categories.js";

export function createApi(config: Config) {
  const app = new Hono();
  const client = createClient(config);

  // ─────────────────────────────────────────────────────
  // 헬퍼
  // ─────────────────────────────────────────────────────

  function obsidianUri(fileNameOrPath: string): string | null {
    if (!config.vaultName || !config.vaultPath) return null;
    const absPath = path.isAbsolute(fileNameOrPath)
      ? fileNameOrPath
      : path.join(config.vaultPath, "spiral-buddy", fileNameOrPath);
    const root = config.obsidianVaultRoot ?? config.vaultPath;
    const relativeToVault = path.relative(root, absPath).replace(/\.md$/, "");
    return `obsidian://open?vault=${encodeURIComponent(config.vaultName)}&file=${encodeURIComponent(relativeToVault)}`;
  }

  /**
   * 사용 가능한 로드맵 목록 — Local + Curated 모두.
   *
   * - Local: SPIRAL_ROADMAP_ROOT 아래에서 discoverRoadmaps
   * - Curated: .cache/curated/<org>/ 에 이미 설치된 레포에서 discoverCuratedRoadmaps
   *   (아직 설치 안 된 큐레이션 레포는 /api/curated/available에서 별도 노출)
   */
  async function getInstalledRoadmaps(): Promise<Roadmap[]> {
    const out: Roadmap[] = [];

    if (config.roadmapRoot) {
      const local = await discoverRoadmaps(config.roadmapRoot);
      const filteredLocal = config.pinnedRoadmapPath
        ? local.filter((r) => r.absolutePath === config.pinnedRoadmapPath)
        : local;
      for (const r of filteredLocal) {
        out.push({ ...r, source: "local" });
      }
    }

    if (config.curatedOrg) {
      const curated = await discoverCuratedRoadmaps(config.curatedOrg);
      for (const r of curated) {
        out.push({ ...r, source: "curated" });
      }
    }

    return out;
  }

  /**
   * roadmap_id로 로드맵 찾기. local + curated 둘 다 처리.
   */
  async function resolveRoadmap(
    roadmapId: string | null,
  ): Promise<Roadmap | null> {
    if (!roadmapId) {
      const all = await getInstalledRoadmaps();
      return all[0] ?? null;
    }

    // Curated id ("curated:org/repo[/sub]")
    if (roadmapId.startsWith("curated:") && config.curatedOrg) {
      const all = await discoverCuratedRoadmaps(config.curatedOrg);
      const match = all.find((r) => r.id === roadmapId);
      if (match) return { ...match, source: "curated" };
      return null;
    }

    // Local
    if (config.roadmapRoot) {
      const local = await findRoadmap(config.roadmapRoot, roadmapId);
      if (local) return { ...local, source: "local" };
    }

    // basename fallback across both sources
    const all = await getInstalledRoadmaps();
    return all.find((r) => r.name === roadmapId) ?? null;
  }

  // ─────────────────────────────────────────────────────
  // 1. Config
  // ─────────────────────────────────────────────────────

  app.get("/config", (c) =>
    c.json({
      roadmapRoot: config.roadmapRoot,
      vaultPath: config.vaultPath,
      vaultName: config.vaultName,
      model: config.model,
      curatedOrg: config.curatedOrg,
    }),
  );

  // ─────────────────────────────────────────────────────
  // 2. Roadmaps (Local + Curated 설치된 것들)
  // ─────────────────────────────────────────────────────

  app.get("/roadmaps", async (c) => {
    const roadmaps = await getInstalledRoadmaps();
    if (roadmaps.length === 0 && !config.curatedOrg && !config.roadmapRoot) {
      return c.json(
        {
          error:
            "SPIRAL_ROADMAP_ROOT 또는 SPIRAL_CURATED_ORG 중 하나는 설정해야 합니다",
        },
        400,
      );
    }
    const notes = config.vaultPath ? await listSpiralNotes(config.vaultPath) : [];

    return c.json(
      await Promise.all(
        roadmaps.map(async (r) => {
          const roadmapNotes = notes.filter((n) =>
            noteBelongsToRoadmap(n, { roadmapId: r.id, roadmapName: r.name }),
          );
          const visitedChapters = new Set(
            roadmapNotes.map((n) => n.chapterId).filter(Boolean),
          );
          const maxDepth = roadmapNotes.reduce(
            (m, n) => Math.max(m, n.depth),
            0,
          );
          const lastDate = roadmapNotes.reduce(
            (latest: string | null, n) =>
              !latest || n.date > latest ? n.date : latest,
            null,
          );
          // Local 로드맵은 path 기반 분류
          const category =
            r.source === "local"
              ? await categorizeLocalRoadmap(config.curatedOrg, r.id)
              : null;
          return {
            id: r.id,
            name: r.name,
            source: r.source ?? "local",
            chapterCount: r.chapterCount,
            visitedChapters: visitedChapters.size,
            totalNotes: roadmapNotes.length,
            maxDepth,
            lastDate,
            category: category
              ? {
                  name: category.name,
                  emoji: category.emoji,
                  color: category.color,
                }
              : null,
          };
        }),
      ),
    );
  });

  // ─────────────────────────────────────────────────────
  // 2-b. Curated repos (available + installed)
  // ─────────────────────────────────────────────────────

  app.get("/curated/available", async (c) => {
    if (!config.curatedOrg) {
      return c.json({ error: "curated source disabled" }, 400);
    }
    const force = c.req.query("refresh") === "1";
    try {
      const repos = await listCuratedRepos({
        org: config.curatedOrg,
        token: config.githubToken ?? undefined,
        forceRefresh: force,
      });
      const groups = await groupReposByCategory(config.curatedOrg, repos);
      return c.json({
        org: config.curatedOrg,
        repos,
        groups: groups.map((g) => ({
          name: g.category.name,
          emoji: g.category.emoji,
          color: g.category.color,
          repos: g.repos,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 502);
    }
  });

  app.post("/curated/install", async (c) => {
    if (!config.curatedOrg) {
      return c.json({ error: "curated source disabled" }, 400);
    }
    const body = await c.req
      .json<{ repo_name: string; org?: string }>()
      .catch(() => null);
    if (!body?.repo_name) {
      return c.json({ error: "repo_name required" }, 400);
    }
    const org = body.org ?? config.curatedOrg;
    try {
      const result = await installCuratedRepo({
        org,
        repoName: body.repo_name,
      });
      return c.json({
        installed: true,
        alreadyInstalled: result.alreadyInstalled,
        cachePath: result.cachePath,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/curated/refresh", async (c) => {
    if (!config.curatedOrg) {
      return c.json({ error: "curated source disabled" }, 400);
    }
    const body = await c.req
      .json<{ repo_name: string; org?: string }>()
      .catch(() => null);
    if (!body?.repo_name) {
      return c.json({ error: "repo_name required" }, 400);
    }
    const org = body.org ?? config.curatedOrg;
    try {
      await refreshCuratedRepo({ org, repoName: body.repo_name });
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/curated/uninstall", async (c) => {
    if (!config.curatedOrg) {
      return c.json({ error: "curated source disabled" }, 400);
    }
    const body = await c.req
      .json<{ repo_name: string; org?: string }>()
      .catch(() => null);
    if (!body?.repo_name) {
      return c.json({ error: "repo_name required" }, 400);
    }
    const org = body.org ?? config.curatedOrg;
    try {
      await uninstallCuratedRepo({ org, repoName: body.repo_name });
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ─────────────────────────────────────────────────────
  // 3. Chapters (로드맵별)
  // ─────────────────────────────────────────────────────

  app.get("/chapters", async (c) => {
    const roadmapId = c.req.query("roadmap_id") ?? null;
    const roadmap = await resolveRoadmap(roadmapId);
    if (!roadmap) {
      return c.json({ error: "Roadmap not found" }, 404);
    }

    const chapters = await loadRoadmapChapters(roadmap);
    const notes = config.vaultPath ? await listSpiralNotes(config.vaultPath) : [];

    return c.json({
      roadmapId: roadmap.id,
      roadmapName: roadmap.name,
      chapters: chapters.map((ch) => {
        const matchingNotes = notes.filter((n) =>
          noteMatchesChapter(n, {
            roadmapId: roadmap.id,
            roadmapName: roadmap.name,
            chapterId: ch.id,
          }),
        );
        const maxDepth = matchingNotes.reduce(
          (m, n) => Math.max(m, n.depth),
          0,
        );
        const lastDate = matchingNotes.reduce(
          (latest: string | null, n) =>
            !latest || n.date > latest ? n.date : latest,
          null,
        );
        return {
          id: ch.id,
          title: ch.title,
          order: ch.order,
          visitCount: matchingNotes.length,
          maxDepth,
          lastDate,
        };
      }),
    });
  });

  // ─────────────────────────────────────────────────────
  // 4. History (전체 or 로드맵별 필터링)
  // ─────────────────────────────────────────────────────

  app.get("/history", async (c) => {
    if (!config.vaultPath) {
      return c.json({ error: "No vault configured" }, 400);
    }
    const roadmapId = c.req.query("roadmap_id");
    let notes = await listSpiralNotes(config.vaultPath);

    if (roadmapId) {
      const roadmap = await resolveRoadmap(roadmapId);
      if (roadmap) {
        notes = notes.filter((n) =>
          noteBelongsToRoadmap(n, {
            roadmapId: roadmap.id,
            roadmapName: roadmap.name,
          }),
        );
      }
    }

    return c.json(
      notes.map((n) => ({
        title: n.title,
        topic: n.topic,
        chapterId: n.chapterId,
        roadmapId: n.roadmapId,
        roadmapName: n.roadmapName,
        date: n.date,
        depth: n.depth,
        summary: n.summary,
        relativePath: n.relativePath,
        obsidianUri: obsidianUri(n.relativePath),
      })),
    );
  });

  // ─────────────────────────────────────────────────────
  // 5. Suggest (로드맵별)
  // ─────────────────────────────────────────────────────

  app.get("/suggest", async (c) => {
    if (!config.vaultPath) {
      return c.json({ error: "Missing vault" }, 400);
    }
    const roadmapId = c.req.query("roadmap_id") ?? null;
    const roadmap = await resolveRoadmap(roadmapId);
    if (!roadmap) {
      return c.json({ error: "Roadmap not found" }, 404);
    }
    const chapters = await loadRoadmapChapters(roadmap);
    const notes = await listSpiralNotes(config.vaultPath);
    const suggestion = await suggestNext(client, roadmap, chapters, notes);
    return c.json(suggestion);
  });

  // ─────────────────────────────────────────────────────
  // 6. Session lifecycle
  // ─────────────────────────────────────────────────────

  app.post("/session/start", async (c) => {
    const body = await c.req
      .json<{ chapterId: string; roadmapId?: string }>()
      .catch(() => null);
    if (!body?.chapterId) {
      return c.json({ error: "chapterId required" }, 400);
    }
    if (!config.vaultPath) {
      return c.json({ error: "Missing vault config" }, 400);
    }

    const roadmap = await resolveRoadmap(body.roadmapId ?? null);
    if (!roadmap) {
      return c.json({ error: "Roadmap not found" }, 404);
    }

    const chapters = await loadRoadmapChapters(roadmap);
    const chapter = chapters.find((ch) => ch.id === body.chapterId);
    if (!chapter) {
      return c.json({ error: "Chapter not found in roadmap" }, 404);
    }

    const allNotes = await listSpiralNotes(config.vaultPath);
    const priorOnSame = allNotes.filter((n) =>
      noteMatchesChapter(n, {
        roadmapId: roadmap.id,
        roadmapName: roadmap.name,
        chapterId: chapter.id,
      }),
    );
    const depth = priorOnSame.length + 1;
    const related = priorOnSame.slice(0, 5);

    const session = createSession({ chapter, depth, related });

    const initialContext = buildInitialContext(chapter, related, depth);
    session.messages.push({ role: "user", content: initialContext });

    c.header("X-Session-Id", session.id);
    c.header("X-Depth", String(depth));
    c.header("X-Chapter-Title", encodeURIComponent(chapter.title));
    c.header("X-Roadmap-Id", encodeURIComponent(roadmap.id));
    c.header("X-Roadmap-Name", encodeURIComponent(roadmap.name));
    c.header("X-Related-Count", String(related.length));

    return streamText(c, async (stream) => {
      try {
        const { text, usage } = await streamTurn(client, {
          system: SESSION_SYSTEM,
          messages: session.messages,
          onText: (chunk) => {
            stream.write(chunk).catch(() => {});
          },
        });
        session.messages.push({ role: "assistant", content: text });
        session.totalInputTokens += usage.input;
        session.totalOutputTokens += usage.output;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await stream.write(`\n\n[Error: ${msg}]`);
      }
    });
  });

  app.post("/session/:id/message", async (c) => {
    const session = getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    const body = await c.req.json<{ message: string }>().catch(() => null);
    if (!body?.message) return c.json({ error: "message required" }, 400);

    session.messages.push({ role: "user", content: body.message });

    return streamText(c, async (stream) => {
      try {
        const { text, usage } = await streamTurn(client, {
          system: SESSION_SYSTEM,
          messages: session.messages,
          onText: (chunk) => {
            stream.write(chunk).catch(() => {});
          },
        });
        session.messages.push({ role: "assistant", content: text });
        session.totalInputTokens += usage.input;
        session.totalOutputTokens += usage.output;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await stream.write(`\n\n[Error: ${msg}]`);
      }
    });
  });

  app.post("/session/:id/end", async (c) => {
    const session = getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!config.vaultPath) {
      return c.json({ error: "Missing vault config" }, 400);
    }

    try {
      const note = await generateNote(client, {
        chapter: session.chapter,
        transcript: session.messages,
        related: session.related,
        depth: session.depth,
      });
      const writtenPath = await writeNewNote(config.vaultPath, note);
      const elapsedMs = Date.now() - session.startedAt;
      const summary = note.summary;
      const inputTokens = session.totalInputTokens;
      const outputTokens = session.totalOutputTokens;
      const depth = session.depth;
      const topic = note.topic;
      deleteSession(session.id);
      return c.json({
        path: writtenPath,
        relativePath: path.basename(writtenPath),
        obsidianUri: obsidianUri(writtenPath),
        elapsedMs,
        inputTokens,
        outputTokens,
        depth,
        topic,
        summary,
        roadmapName: session.chapter.roadmapName,
        roadmapId: session.chapter.roadmapId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/session/:id/cancel", (c) => {
    const ok = deleteSession(c.req.param("id"));
    return c.json({ cancelled: ok });
  });

  return app;
}
