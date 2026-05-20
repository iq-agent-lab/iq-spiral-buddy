// Spiral Buddy — Electron main process (CommonJS)
//
// 흐름:
//  1. app.whenReady → loadConfig (userData/config.json)
//  2. 필수값(API 키, vault) 없으면 setup wizard 창
//  3. 있으면 spawn server (Electron binary를 Node 모드로) + BrowserWindow(localhost:port)
//
// 빌드 전제: src/는 tsc로 dist/에 컴파일되어 있어야 함.
// 패키징 시 electron-builder가 dist/, client/, electron/, data/, node_modules/를 묶음.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");

// asar 외부에 둬야 child process가 접근 가능 (asar는 file:// import만 됨)
const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");

const CONFIG_PATH = path.join(app.getPath("userData"), "spiral-buddy-config.json");

let mainWindow = null;
let setupWindow = null;
let serverProcess = null;
let serverPort = null;

function loadConfig() {
  // 1순위: userData에 저장된 GUI 설정
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    /* fallthrough */
  }
  // 2순위: APP_ROOT/.env (dev 환경, 또는 사용자가 직접 .env로 운영)
  try {
    const envPath = path.join(APP_ROOT, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const get = (key) => {
        const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
        if (!m) return null;
        return m[1].trim().replace(/^["']|["']$/g, "");
      };
      const apiKey = get("ANTHROPIC_API_KEY");
      const vaultPath = get("SPIRAL_VAULT_PATH");
      if (apiKey && vaultPath) {
        return {
          anthropicApiKey: apiKey,
          vaultPath,
          roadmapRoot: get("SPIRAL_ROADMAP_ROOT"),
          curatedOrg: get("SPIRAL_CURATED_ORG"),
          model: get("SPIRAL_MODEL"),
          maxTokens: get("SPIRAL_MAX_TOKENS")
            ? Number(get("SPIRAL_MAX_TOKENS"))
            : null,
          vaultName: get("SPIRAL_VAULT_NAME"),
          githubToken: get("SPIRAL_GITHUB_TOKEN"),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

function hasRequiredConfig(cfg) {
  return Boolean(
    cfg &&
      typeof cfg.anthropicApiKey === "string" &&
      cfg.anthropicApiKey.length > 0 &&
      typeof cfg.vaultPath === "string" &&
      cfg.vaultPath.length > 0,
  );
}

async function findFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function startServerProcess(cfg) {
  const port = serverPort;
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ANTHROPIC_API_KEY: cfg.anthropicApiKey,
    SPIRAL_VAULT_PATH: cfg.vaultPath,
    PORT: String(port),
    NO_OPEN: "1", // Electron이 BrowserWindow로 열기 때문에 자동 브라우저 오픈 끔
  };
  if (cfg.roadmapRoot) env.SPIRAL_ROADMAP_ROOT = cfg.roadmapRoot;
  if (cfg.curatedOrg) env.SPIRAL_CURATED_ORG = cfg.curatedOrg;
  if (cfg.githubToken) env.SPIRAL_GITHUB_TOKEN = cfg.githubToken;
  if (cfg.model) env.SPIRAL_MODEL = cfg.model;
  if (cfg.maxTokens) env.SPIRAL_MAX_TOKENS = String(cfg.maxTokens);
  if (cfg.vaultName) env.SPIRAL_VAULT_NAME = cfg.vaultName;

  const serverEntry = path.join(APP_ROOT, "dist", "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Server entry not found: ${serverEntry}\nDid you forget to run 'pnpm build'?`,
    );
  }

  serverProcess = spawn(process.execPath, [serverEntry], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout?.on("data", (b) => process.stdout.write(`[srv] ${b}`));
  serverProcess.stderr?.on("data", (b) => process.stderr.write(`[srv] ${b}`));
  serverProcess.on("exit", (code) => {
    console.log(`[main] server exited with code ${code}`);
    serverProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "Spiral Buddy",
        `백엔드 서버가 종료되었습니다 (exit ${code}). 앱을 다시 시작해주세요.`,
      );
      app.quit();
    }
  });
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 600,
    height: 640,
    title: "Spiral Buddy — 초기 설정",
    backgroundColor: "#0e0e11",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.on("closed", () => {
    setupWindow = null;
    if (!mainWindow && !serverProcess) {
      // 사용자가 설정 안 하고 닫음 → 앱 종료
      app.quit();
    }
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "Spiral Buddy",
    backgroundColor: "#0e0e11",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 메인 메뉴 단순화 (macOS 표준 + 기본 단축키만)
  if (process.platform !== "darwin") {
    mainWindow.setMenuBarVisibility(false);
  }
  const url = `http://127.0.0.1:${serverPort}`;
  await mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootWithConfig(cfg) {
  serverPort = await findFreePort();
  startServerProcess(cfg);
  const ready = await waitForServer(serverPort);
  if (!ready) {
    dialog.showErrorBox(
      "Spiral Buddy",
      "백엔드 서버를 시작할 수 없습니다. 콘솔 로그를 확인하세요.",
    );
    app.quit();
    return;
  }
  await createMainWindow();
}

// ─── IPC handlers (setup wizard) ─────────────────────────────

ipcMain.handle("setup:get-current-config", () => loadConfig() ?? {});

ipcMain.handle("setup:pick-directory", async (_e, opts) => {
  const result = await dialog.showOpenDialog({
    title: opts?.title ?? "디렉토리 선택",
    properties: ["openDirectory"],
    defaultPath: opts?.defaultPath || app.getPath("home"),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("setup:validate-and-save", async (_e, cfg) => {
  // 최소 검증
  if (!cfg?.anthropicApiKey?.startsWith("sk-")) {
    return { ok: false, error: "API 키는 'sk-'로 시작해야 합니다." };
  }
  if (!cfg?.vaultPath || !fs.existsSync(cfg.vaultPath)) {
    return { ok: false, error: "Vault 경로가 존재하지 않습니다." };
  }
  if (cfg.roadmapRoot && !fs.existsSync(cfg.roadmapRoot)) {
    return { ok: false, error: "Roadmap 경로가 존재하지 않습니다." };
  }
  saveConfig(cfg);
  // setup → main으로 전환
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
  await bootWithConfig(cfg);
  return { ok: true };
});

ipcMain.handle("app:open-external", (_e, url) => {
  if (typeof url === "string") shell.openExternal(url);
});

// ─── App lifecycle ───────────────────────────────────────────

app.whenReady().then(async () => {
  // macOS 기본 메뉴 유지 (Cmd+Q 등)
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.getApplicationMenu());
  }

  const cfg = loadConfig();
  if (hasRequiredConfig(cfg)) {
    await bootWithConfig(cfg);
  } else {
    createSetupWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const cfg = loadConfig();
    if (hasRequiredConfig(cfg)) bootWithConfig(cfg);
    else createSetupWindow();
  }
});
