import { serve } from "@hono/node-server";
import { Hono } from "hono";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import open from "open";
import chalk from "chalk";

import { loadConfig } from "./config.js";
import { createApi } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "../client");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function main() {
  const config = loadConfig();

  const app = new Hono();

  // API
  app.route("/api", createApi(config));

  // Static client (single-file server)
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    const requestPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const safe = path.normalize(requestPath).replace(/^[/\\]+/, "");
    const filePath = path.join(CLIENT_DIR, safe);
    if (!filePath.startsWith(CLIENT_DIR)) return c.notFound();
    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      return new Response(content, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return c.notFound();
    }
  });

  const port = Number(process.env.PORT ?? 3737);
  const url = `http://localhost:${port}`;

  serve({ fetch: app.fetch, port }, async () => {
    console.log();
    console.log(chalk.bold.cyan("  🌀 iq-spiral-buddy"));
    console.log(chalk.gray("  spiral learning · Claude × Obsidian"));
    console.log();
    console.log(
      chalk.gray(`  roadmap root: ${config.roadmapRoot ?? "(unset, Local off)"}`),
    );
    if (config.pinnedRoadmapPath) {
      console.log(
        chalk.gray(
          `  (pinned to single roadmap: ${path.basename(config.pinnedRoadmapPath)})`,
        ),
      );
    } else if (config.roadmapRoot) {
      const { discoverRoadmaps } = await import("./roadmap.js");
      const roadmaps = await discoverRoadmaps(config.roadmapRoot);
      console.log(chalk.gray(`  local roadmaps: ${roadmaps.length}`));
    }
    if (config.curatedOrg) {
      console.log(
        chalk.gray(`  curated org:  ${config.curatedOrg}`),
      );
      const { discoverCuratedRoadmaps, listInstalledRepoNames } = await import(
        "./curated.js"
      );
      const installed = await listInstalledRepoNames(config.curatedOrg);
      const installedRoadmaps = await discoverCuratedRoadmaps(
        config.curatedOrg,
      );
      console.log(
        chalk.gray(
          `  curated installed: ${installed.length} repos, ${installedRoadmaps.length} roadmaps`,
        ),
      );
    } else {
      console.log(chalk.gray("  curated: disabled"));
    }
    console.log(chalk.gray(`  vault:   ${config.vaultPath ?? "(unset)"}`));
    if (
      config.obsidianVaultRoot &&
      config.obsidianVaultRoot !== config.vaultPath
    ) {
      console.log(
        chalk.gray(
          `  obsidian root: ${config.obsidianVaultRoot} (auto-detected via .obsidian/)`,
        ),
      );
    } else if (!config.obsidianVaultRoot && config.vaultPath) {
      console.log(
        chalk.yellow(
          `  ⚠ no .obsidian/ found near vault path — obsidian links may not work`,
        ),
      );
    }
    console.log(chalk.gray(`  vault name: ${config.vaultName ?? "(unset)"}`));
    console.log(chalk.gray(`  model:   ${config.model}`));
    console.log();
    console.log(chalk.green(`  → ${url}`));
    console.log();
  });

  if (process.env.NO_OPEN !== "1") {
    setTimeout(() => {
      open(url).catch(() => {
        console.log(chalk.gray(`  (auto-open failed, visit ${url} manually)`));
      });
    }, 500);
  }
}

main().catch((err) => {
  console.error(
    chalk.red("\n× Fatal:"),
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
