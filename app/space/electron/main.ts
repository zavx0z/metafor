import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, screen } from "electron"
import { join } from "node:path"

// WebGPU is already on by default in modern Chromium / Electron, but keep as
// a belt-and-suspenders so older Electron versions still work.
app.commandLine.appendSwitch("enable-unsafe-webgpu")
app.commandLine.appendSwitch("enable-features", "Vulkan,WebGPU")

const DEV_URL = process.env.SPACE_DEV_URL ?? null

function createOverlay() {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    focusable: false, // overlay does not steal focus
    fullscreenable: false,
    backgroundColor: "#00000000",
    // type:'panel' would print "NSWindow does not support nonactivating panel styleMask 0x80"; focusable:false is enough for our overlay
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  // float above normal windows, including over fullscreen apps
  win.setAlwaysOnTop(true, "screen-saver")
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // click-through: cursor passes to the app underneath
  // forward:true keeps mouse-move events flowing if the renderer ever needs hover
  win.setIgnoreMouseEvents(true, { forward: true })

  if (DEV_URL) {
    console.log(`[space] loading dev URL: ${DEV_URL}`)
    win.loadURL(DEV_URL)
  } else {
    // app.getAppPath() resolves at runtime to the asar root in packaged builds
    const indexPath = join(app.getAppPath(), "dist", "index.html")
    console.log(`[space] loading: ${indexPath}`)
    win.loadFile(indexPath)
  }

  win.webContents.on("did-finish-load", () => {
    console.log("[space] renderer loaded")
  })

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[space] renderer gone:", details)
  })

  return win
}

let overlayWindow: BrowserWindow | undefined
let trayIcon: Tray | undefined

function toggleOverlay(): void {
  if (overlayWindow === undefined || overlayWindow.isDestroyed()) {
    overlayWindow = createOverlay()
    return
  }
  if (overlayWindow.isVisible()) overlayWindow.hide()
  else overlayWindow.show()
}

function reloadOverlay(): void {
  if (overlayWindow === undefined || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.reload()
}

function toggleDevTools(): void {
  if (overlayWindow === undefined || overlayWindow.isDestroyed()) return
  if (overlayWindow.webContents.isDevToolsOpened()) overlayWindow.webContents.closeDevTools()
  else overlayWindow.webContents.openDevTools({mode: "detach"})
}

function quitApp(): void {
  app.quit()
}

function createTray(): Tray {
  // Template-image (16x16/22x22, чёрный + альфа) автоматически тинится macOS под
  // dark/light. Используем простую квадратную иконку in-memory чтобы не таскать ассеты.
  // 22x22 1bit dot — достаточно для menu bar.
  const dot = nativeImage.createFromBuffer(Buffer.from(BASE64_TEMPLATE_DOT, "base64"))
  dot.setTemplateImage(true)
  const tray = new Tray(dot)
  tray.setToolTip("metafor / space — overlay")
  const menu = Menu.buildFromTemplate([
    {label: "Show / Hide overlay", click: toggleOverlay, accelerator: "Cmd+Shift+Space"},
    {label: "Reload renderer", click: reloadOverlay, accelerator: "Cmd+R"},
    {label: "Toggle DevTools", click: toggleDevTools, accelerator: "Cmd+Alt+I"},
    {type: "separator"},
    {label: "Quit", click: quitApp, accelerator: "Cmd+Q"},
  ])
  tray.setContextMenu(menu)
  return tray
}

// 22x22 чёрное кольцо с прозрачным центром, template image (macOS подкрашивает под тему)
const BASE64_TEMPLATE_DOT =
  "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAARUlEQVR42mNgGG7gPwFMdQPJsuA/mZgmhhI0nFgNJBlMTtgRpYduBpMb2aMGD4LIo5rBNMsgNM3SNCuEaFps0rSgH7wAAKznwz1UM8TFAAAAAElFTkSuQmCC"

app.whenReady().then(() => {
  // hide dock on macOS so the overlay app doesn't grab a Dock slot
  if (process.platform === "darwin" && app.dock && !DEV_URL) {
    app.dock.hide()
  }
  overlayWindow = createOverlay()
  trayIcon = createTray()

  // глобальный шорткат для toggle overlay — работает даже когда фокус не на нашем приложении
  globalShortcut.register("CommandOrControl+Shift+Space", toggleOverlay)
  // Cmd+Q глобально завершает приложение даже когда нет focusable окна
  globalShortcut.register("Command+Q", quitApp)
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
  trayIcon?.destroy()
})

// На macOS overlay-приложение не должно умирать когда окно скрыто/закрыто —
// его контролируют через tray menu и Cmd+Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
