import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
} from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

app.commandLine.appendSwitch("enable-unsafe-webgpu")
app.commandLine.appendSwitch("enable-features", "Vulkan,WebGPU")

protocol.registerSchemesAsPrivileged([
  {
    scheme: "space",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const DEV_URL = process.env.SPACE_DEV_URL ?? null
const DEBUG_PORT = Number(process.env.SPACE_DEBUG_PORT ?? 6500)
const DEBUG_HOST = process.env.SPACE_DEBUG_HOST ?? "127.0.0.1"
const DEBUG_BASE = `http://${DEBUG_HOST}:${DEBUG_PORT}`

let debugServerUrl = DEBUG_BASE
let debugServerOwned = false
let debugServerProc: ChildProcess | null = null

function preloadPath(): string {
  return join(app.getAppPath(), "out", "preload.cjs")
}

function statePath(): string {
  const dir = app.getPath("userData")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, "state.json")
}

type PersistedState = {
  projectDir?: string
  entryFile?: string
  command?: string[]
  pauseOnStart?: boolean
}

function readState(): PersistedState {
  const file = statePath()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PersistedState
  } catch {
    return {}
  }
}

function writeState(next: PersistedState): void {
  writeFileSync(statePath(), JSON.stringify(next, null, 2), "utf8")
}

async function probeDebugServer(url: string, timeoutMs = 600): Promise<boolean> {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return r.ok
  } catch {
    return false
  }
}

function findWorkspaceRoot(start: string): string | null {
  let dir = start
  while (true) {
    if (existsSync(join(dir, "pkg/debug/agent-attach.ts"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function findBunBinary(): string | null {
  for (const p of ["/opt/homebrew/bin/bun", "/usr/local/bin/bun", `${process.env.HOME}/.bun/bin/bun`]) {
    if (existsSync(p)) return p
  }
  // PATH search via shell — Electron's spawn doesn't expand $PATH for us,
  // but `which` does
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    const r = execSync("/usr/bin/which bun", { encoding: "utf8" }).trim()
    if (r.length > 0 && existsSync(r)) return r
  } catch {}
  return null
}

async function spawnDebugServer(): Promise<boolean> {
  const wsRoot = findWorkspaceRoot(app.getAppPath())
  if (wsRoot === null) {
    console.warn("[space] cannot spawn debug-server: workspace root with pkg/debug/agent-attach.ts not found")
    return false
  }
  const bun = findBunBinary()
  if (bun === null) {
    console.warn("[space] cannot spawn debug-server: bun binary not found in PATH")
    return false
  }
  const agentEntry = join(wsRoot, "pkg/debug/agent-attach.ts")
  console.log(`[space] spawning debug-server: ${bun} --hot ${agentEntry}`)

  debugServerProc = spawn(bun, ["--hot", agentEntry], {
    cwd: wsRoot,
    env: {
      ...process.env,
      AGENT_HTTP_HOST: DEBUG_HOST,
      AGENT_HTTP_PORT: String(DEBUG_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  })

  debugServerProc.stdout?.on("data", (chunk) => process.stdout.write(`[debug] ${String(chunk)}`))
  debugServerProc.stderr?.on("data", (chunk) => process.stderr.write(`[debug] ${String(chunk)}`))
  debugServerProc.on("exit", (code) => {
    console.log(`[space] debug-server exited: code=${code}`)
    debugServerProc = null
    debugServerOwned = false
  })

  // wait health up to 10s
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await probeDebugServer(DEBUG_BASE, 400)) {
      debugServerOwned = true
      return true
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  console.warn("[space] debug-server did not become healthy within 10s")
  try {
    debugServerProc?.kill()
  } catch {}
  debugServerProc = null
  return false
}

async function ensureDebugServer(): Promise<void> {
  if (await probeDebugServer(DEBUG_BASE, 600)) {
    console.log(`[space] using existing debug-server at ${DEBUG_BASE}`)
    debugServerUrl = DEBUG_BASE
    return
  }
  const ok = await spawnDebugServer()
  if (ok) {
    console.log(`[space] debug-server started at ${DEBUG_BASE}`)
    debugServerUrl = DEBUG_BASE
  } else {
    console.warn(`[space] debug-server unavailable; UI will show offline`)
  }
}

function createOverlay(): BrowserWindow {
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
    focusable: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webviewTag: false,
      preload: preloadPath(),
    },
  })

  win.setAlwaysOnTop(true, "screen-saver")
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })

  if (DEV_URL) {
    console.log(`[space] loading dev URL: ${DEV_URL}`)
    win.loadURL(DEV_URL)
  } else {
    const url = "space://./index.html"
    console.log(`[space] loading: ${url}`)
    win.loadURL(url)
  }

  win.webContents.on("did-finish-load", () => console.log("[space] renderer loaded"))
  win.webContents.on("render-process-gone", (_e, details) =>
    console.error("[space] renderer gone:", details),
  )

  // Cross-origin CSS injection в iframe debug-UI: делаем body/sections прозрачными
  // чтобы под канвасом editor'а был виден backdrop-blur карточки.
  win.webContents.on("did-frame-finish-load", (_e, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame) return
    const subFrames = win.webContents.mainFrame.framesInSubtree
    const frame = subFrames.find((f) => f.processId === frameProcessId && f.routingId === frameRoutingId)
    if (frame === undefined) return
    frame.executeJavaScript(IFRAME_OVERLAY_CSS_INJECTION).catch((err) => {
      console.error("[space] css injection failed:", err)
    })
  })

  return win
}

const IFRAME_OVERLAY_CSS_INJECTION = `(() => {
  const id = "space-overlay-style"
  if (document.getElementById(id) !== null) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = \`
    html, body { background: transparent !important; }
    body > header {
      background: rgba(13, 17, 23, 0.5) !important;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    body > main { background: transparent !important; }
    body > main section {
      background: rgba(13, 17, 23, 0.4) !important;
      border-color: rgba(48, 54, 61, 0.45) !important;
    }
    body > main section h2 {
      background: rgba(13, 17, 23, 0.35) !important;
    }
    /* source-view: только буквы, фон пускает блюр */
    section#source-section { background: transparent !important; border-color: transparent !important; }
    section#source-section h2 { background: transparent !important; }
    canvas#engine-source-canvas { background: transparent !important; }
  \`
  document.head.appendChild(style)
})()`

let overlayWindow: BrowserWindow | undefined
let trayIcon: Tray | undefined

function setInteractive(value: boolean): void {
  if (overlayWindow === undefined || overlayWindow.isDestroyed()) return
  if (value) overlayWindow.setIgnoreMouseEvents(false)
  else overlayWindow.setIgnoreMouseEvents(true, { forward: true })
}

function toggleOverlay(): void {
  if (overlayWindow === undefined || overlayWindow.isDestroyed()) {
    overlayWindow = createOverlay()
    return
  }
  if (overlayWindow.isVisible()) overlayWindow.hide()
  else overlayWindow.show()
}

function reloadOverlay(): void {
  overlayWindow?.webContents.reload()
}

function toggleDevTools(): void {
  if (overlayWindow === undefined) return
  if (overlayWindow.webContents.isDevToolsOpened()) overlayWindow.webContents.closeDevTools()
  else overlayWindow.webContents.openDevTools({ mode: "detach" })
}

function quitApp(): void {
  app.quit()
}

function createTray(): Tray {
  const dot = nativeImage.createFromBuffer(Buffer.from(BASE64_TEMPLATE_DOT, "base64"))
  dot.setTemplateImage(true)
  const tray = new Tray(dot)
  tray.setToolTip("metafor / space — overlay")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show / Hide overlay", click: toggleOverlay, accelerator: "Cmd+Shift+Space" },
      { label: "Reload renderer", click: reloadOverlay, accelerator: "Cmd+R" },
      { label: "Toggle DevTools", click: toggleDevTools, accelerator: "Cmd+Alt+I" },
      { type: "separator" },
      { label: "Quit", click: quitApp, accelerator: "Cmd+Q" },
    ]),
  )
  return tray
}

const BASE64_TEMPLATE_DOT =
  "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAARUlEQVR42mNgGG7gPwFMdQPJsuA/mZgmhhI0nFgNJBlMTtgRpYduBpMb2aMGD4LIo5rBNMsgNM3SNCuEaFps0rSgH7wAAKznwz1UM8TFAAAAAElFTkSuQmCC"

function setupIpc(): void {
  ipcMain.on("space:set-interactive", (_e, value: unknown) => setInteractive(Boolean(value)))

  ipcMain.handle("space:get-debug-url", () => debugServerUrl)
  ipcMain.handle("space:debug-server-running", async () => probeDebugServer(debugServerUrl, 400))

  ipcMain.handle("space:get-state", () => readState())
  ipcMain.handle("space:set-state", (_e, next: unknown) => {
    writeState((next ?? {}) as PersistedState)
  })

  ipcMain.handle("space:pick-directory", async (_e, defaultPath?: string) => {
    if (overlayWindow === undefined) return null
    const opts: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Выбор директории проекта",
    }
    if (typeof defaultPath === "string" && defaultPath.length > 0) opts.defaultPath = defaultPath
    const r = await dialog.showOpenDialog(overlayWindow, opts)
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  ipcMain.handle(
    "space:pick-file",
    async (_e, args?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
      if (overlayWindow === undefined) return null
      const opts: Electron.OpenDialogOptions = {
        properties: ["openFile"],
        title: "Файл-точка входа для отладки",
      }
      if (args?.defaultPath !== undefined) opts.defaultPath = args.defaultPath
      if (args?.filters !== undefined) opts.filters = args.filters
      const r = await dialog.showOpenDialog(overlayWindow, opts)
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
    },
  )

  ipcMain.handle(
    "space:run-target",
    async (
      _e,
      params: { command: string[]; cwd?: string; pauseOnStart?: boolean },
    ): Promise<{ ok: boolean; error?: string; snapshot?: unknown }> => {
      try {
        const r = await fetch(`${debugServerUrl}/target/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: params.command,
            cwd: params.cwd,
            pauseOnStart: params.pauseOnStart === true,
          }),
        })
        const json = (await r.json()) as { ok: boolean; error?: string; snapshot?: unknown }
        return json
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle("space:stop-target", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch(`${debugServerUrl}/target/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      return (await r.json()) as { ok: boolean; error?: string }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle("space:resolve-path", (_e, p: string) => resolve(p))
}

app.whenReady().then(async () => {
  protocol.handle("space", (req) => {
    const url = new URL(req.url)
    const filePath = join(app.getAppPath(), "dist", decodeURIComponent(url.pathname))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  setupIpc()

  if (process.platform === "darwin" && app.dock && !DEV_URL) {
    app.dock.hide()
  }

  await ensureDebugServer()

  overlayWindow = createOverlay()
  trayIcon = createTray()

  globalShortcut.register("CommandOrControl+Shift+Space", toggleOverlay)
  globalShortcut.register("Command+Q", quitApp)
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
  trayIcon?.destroy()
  if (debugServerOwned && debugServerProc !== null) {
    try {
      debugServerProc.kill("SIGTERM")
    } catch {}
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
