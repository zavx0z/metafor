const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("space", {
  getInterpreterUrl: () => ipcRenderer.invoke("space:get-interpreter-url"),
  isInterpreterRunning: () => ipcRenderer.invoke("space:interpreter-running"),
  getState: () => ipcRenderer.invoke("space:get-state"),
  setState: (next) => ipcRenderer.invoke("space:set-state", next),
  pickDirectory: (defaultPath) => ipcRenderer.invoke("space:pick-directory", defaultPath),
  pickFile: (args) => ipcRenderer.invoke("space:pick-file", args),
  runTarget: (params) => ipcRenderer.invoke("space:run-target", params),
  stopTarget: () => ipcRenderer.invoke("space:stop-target"),
  resolvePath: (p) => ipcRenderer.invoke("space:resolve-path", p),
})

// Mixed-mode click-through hit-test: пока курсор над DOM-элементами card —
// окно interactive, иначе — click-through (см. main.ts setIgnoreMouseEvents).
let interactive = false

function setInteractive(next) {
  if (next === interactive) return
  interactive = next
  ipcRenderer.send("space:set-interactive", next)
}

function isCardElement(el) {
  if (el === null) return false
  if (el === document.documentElement) return false
  if (el === document.body) return false
  return true
}

window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener(
    "mousemove",
    (event) => setInteractive(isCardElement(document.elementFromPoint(event.clientX, event.clientY))),
    { capture: true, passive: true },
  )
  document.addEventListener("mouseleave", () => setInteractive(false))
  window.addEventListener("blur", () => setInteractive(false))
})
