const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  // Auth
  getStatus: () => ipcRenderer.invoke("auth:status"),
  signIn: (email, password) => ipcRenderer.invoke("auth:signIn", { email, password }),
  sendOtp: (email) => ipcRenderer.invoke("auth:sendOtp", { email }),
  verifyOtp: (email, token) => ipcRenderer.invoke("auth:verifyOtp", { email, token }),
  signInWithToken: (token) => ipcRenderer.invoke("auth:signInWithToken", { token }),
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
