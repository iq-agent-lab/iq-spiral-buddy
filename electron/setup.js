// Setup wizard 클라이언트. window.spiralSetup IPC만 사용 (preload).

const $ = (id) => document.getElementById(id);
const apiKey = $("api-key");
const vaultPath = $("vault-path");
const roadmapRoot = $("roadmap-root");
const errorMsg = $("error-msg");
const saveBtn = $("save-btn");

async function init() {
  const cfg = await window.spiralSetup.getCurrentConfig();
  if (cfg.anthropicApiKey) apiKey.value = cfg.anthropicApiKey;
  if (cfg.vaultPath) vaultPath.value = cfg.vaultPath;
  if (cfg.roadmapRoot) roadmapRoot.value = cfg.roadmapRoot;
}

$("pick-vault").addEventListener("click", async () => {
  const p = await window.spiralSetup.pickDirectory({
    title: "Obsidian Vault 선택",
    defaultPath: vaultPath.value,
  });
  if (p) vaultPath.value = p;
});

$("pick-roadmap").addEventListener("click", async () => {
  const p = await window.spiralSetup.pickDirectory({
    title: "학습 자료 디렉토리 선택",
    defaultPath: roadmapRoot.value,
  });
  if (p) roadmapRoot.value = p;
});

$("link-console").addEventListener("click", (e) => {
  const url = e.currentTarget.dataset.href;
  if (url) window.spiralSetup.openExternal(url);
});

saveBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  saveBtn.disabled = true;
  saveBtn.textContent = "검증 중…";
  const cfg = {
    anthropicApiKey: apiKey.value.trim(),
    vaultPath: vaultPath.value.trim(),
    roadmapRoot: roadmapRoot.value.trim() || null,
  };
  const result = await window.spiralSetup.validateAndSave(cfg);
  if (!result.ok) {
    errorMsg.textContent = result.error || "저장 실패";
    saveBtn.disabled = false;
    saveBtn.textContent = "시작하기";
  }
  // 성공 시 main에서 setup 창을 닫으므로 별도 처리 불필요
});

// Enter로도 저장
[apiKey, vaultPath, roadmapRoot].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });
});

init();
