// 안전한 IPC bridge — setup wizard에서만 사용. 메인 앱(브라우저 영역)에선 fetch /api/*만 사용.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spiralSetup", {
  getCurrentConfig: () => ipcRenderer.invoke("setup:get-current-config"),
  pickDirectory: (opts) => ipcRenderer.invoke("setup:pick-directory", opts),
  validateAndSave: (cfg) => ipcRenderer.invoke("setup:validate-and-save", cfg),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
});
