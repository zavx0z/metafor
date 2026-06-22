const {app, BrowserWindow, session, shell} = require("electron")

const META_URL = process.env.METAFOR_URL || "https://meta.proizvodstvo1.ru/"
const META_ORIGIN = new URL(META_URL).origin
const TRUSTED_ORIGINS = new Set([META_ORIGIN, "https://sso.proizvodstvo1.ru"])
const DEBUG_PORT = process.env.METAFOR_ELECTRON_DEBUG_PORT

app.commandLine.appendSwitch("enable-unsafe-webgpu")
app.commandLine.appendSwitch("ignore-gpu-blocklist")
app.commandLine.appendSwitch("enable-features", "WebGPU")

if (DEBUG_PORT !== undefined && DEBUG_PORT.trim() !== "") {
  app.commandLine.appendSwitch("remote-debugging-port", DEBUG_PORT)
}

function isTrustedUrl(url) {
  try {
    return TRUSTED_ORIGINS.has(new URL(url).origin)
  } catch {
    return false
  }
}

function installPermissions(appSession) {
  const allowed = new Set([
    "display-capture",
    "fullscreen",
    "media",
    "mediaKeySystem",
    "microphone",
    "notifications",
    "pointerLock",
  ])

  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL()
    callback(isTrustedUrl(url) && allowed.has(permission))
  })

  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const url = requestingOrigin || webContents?.getURL() || ""
    return isTrustedUrl(url) && allowed.has(permission)
  })
}

function createWindow() {
  const appSession = session.fromPartition("persist:metafor")

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    fullscreen: false,
    title: "MetaFor",
    backgroundColor: "#0b0f14",
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      nodeIntegration: false,
      session: appSession,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once("ready-to-show", () => win.show())

  win.webContents.setWindowOpenHandler(({url}) => {
    if (isTrustedUrl(url)) {
      win.loadURL(url)
    } else {
      shell.openExternal(url)
    }
    return {action: "deny"}
  })

  win.webContents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return
    event.preventDefault()
    shell.openExternal(url)
  })

  win.loadURL(META_URL)
  return win
}

app.whenReady().then(() => {
  installPermissions(session.fromPartition("persist:metafor"))
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
