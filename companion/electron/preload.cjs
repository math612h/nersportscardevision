const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  // Auth
  getStatus: () => ipcRenderer.invoke("auth:status"),
  signIn: (email, password) => ipcRenderer.invoke("auth:signIn", { email, password }),
  signOut: () => ipcRenderer.invoke("auth:signOut"),

  // LMU
  getLmuStatus: () => ipcRenderer.invoke("lmu:status"),
  scanNow: () => ipcRenderer.invoke("lmu:scanNow"),

  // Events from main → renderer
  onStatusUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("status:update", handler);
    return () => ipcRenderer.removeListener("status:update", handler);
  },
});
