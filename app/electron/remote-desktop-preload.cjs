const {contextBridge, ipcRenderer} = require("electron")

contextBridge.exposeInMainWorld("metaforRemoteDesktop", {
  input(payload) {
    return ipcRenderer.invoke("remote-desktop:input", payload)
  },
  state(payload) {
    ipcRenderer.send("remote-desktop:state", payload)
  },
})
