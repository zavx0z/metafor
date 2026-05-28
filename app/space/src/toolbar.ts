export {}

type PersistedState = {
  projectDir?: string
  entryFile?: string
  command?: string[]
  pauseOnStart?: boolean
}

declare global {
  interface Window {
    space: {
      getDebugUrl(): Promise<string>
      isDebugServerRunning(): Promise<boolean>
      getState(): Promise<PersistedState>
      setState(next: PersistedState): Promise<void>
      pickDirectory(defaultPath?: string): Promise<string | null>
      pickFile(args?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
      runTarget(params: { command: string[]; cwd?: string; pauseOnStart?: boolean }): Promise<{ ok: boolean; error?: string; snapshot?: unknown }>
      stopTarget(): Promise<{ ok: boolean; error?: string }>
      resolvePath(p: string): Promise<string>
    }
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} not in DOM`)
  return el as T
}

const serverStatus = $<HTMLSpanElement>("server-status")
const projectPath = $<HTMLSpanElement>("project-path")
const entryPath = $<HTMLSpanElement>("entry-path")
const pickProjectBtn = $<HTMLButtonElement>("pick-project")
const pickFileBtn = $<HTMLButtonElement>("pick-file")
const runBtn = $<HTMLButtonElement>("run")
const stopBtn = $<HTMLButtonElement>("stop")
const pauseCheckbox = $<HTMLInputElement>("pause-on-start")
const debugFrame = $<HTMLIFrameElement>("debug-frame")
const overlayMsg = $<HTMLDivElement>("overlay-msg")

let state: PersistedState = {}

function setStatus(text: string, kind: "ok" | "spawning" | "fail" | "neutral"): void {
  serverStatus.textContent = `debug: ${text}`
  serverStatus.classList.remove("ok", "spawning", "fail")
  if (kind !== "neutral") serverStatus.classList.add(kind)
}

function setPath(node: HTMLSpanElement, value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    node.textContent = ""
    node.classList.remove("set")
  } else {
    node.textContent = value
    node.classList.add("set")
  }
}

function showError(message: string): void {
  overlayMsg.hidden = false
  overlayMsg.textContent = message
}

function clearError(): void {
  overlayMsg.hidden = true
  overlayMsg.textContent = ""
}

async function persist(patch: Partial<PersistedState>): Promise<void> {
  state = { ...state, ...patch }
  await window.space.setState(state)
}

async function init(): Promise<void> {
  state = await window.space.getState()
  setPath(projectPath, state.projectDir)
  setPath(entryPath, state.entryFile)
  pauseCheckbox.checked = state.pauseOnStart === true

  const url = await window.space.getDebugUrl()
  const running = await window.space.isDebugServerRunning()
  if (running) {
    setStatus(url, "ok")
    debugFrame.src = url
    clearError()
  } else {
    setStatus("offline", "fail")
    showError(`Debug-сервер не отвечает на ${url}. Запусти его вручную (\`bun run debug\`) и нажми Reload (⌘R), либо запусти space заново — он попробует поднять.`)
  }
}

pickProjectBtn.addEventListener("click", async () => {
  const next = await window.space.pickDirectory(state.projectDir)
  if (next === null) return
  await persist({ projectDir: next })
  setPath(projectPath, next)
})

pickFileBtn.addEventListener("click", async () => {
  const next = await window.space.pickFile({
    defaultPath: state.projectDir ?? state.entryFile,
    filters: [
      { name: "TypeScript / JavaScript", extensions: ["ts", "tsx", "js", "mjs", "cjs"] },
      { name: "Все", extensions: ["*"] },
    ],
  })
  if (next === null) return
  await persist({ entryFile: next })
  setPath(entryPath, next)
})

pauseCheckbox.addEventListener("change", () => {
  void persist({ pauseOnStart: pauseCheckbox.checked })
})

runBtn.addEventListener("click", async () => {
  if (state.entryFile === undefined) {
    showError("Сначала выбери entry-файл")
    return
  }
  clearError()
  runBtn.disabled = true
  try {
    const result = await window.space.runTarget({
      command: ["bun", state.entryFile],
      cwd: state.projectDir,
      pauseOnStart: state.pauseOnStart === true,
    })
    if (!result.ok) showError(`Run failed: ${result.error ?? "unknown"}`)
  } finally {
    runBtn.disabled = false
  }
})

stopBtn.addEventListener("click", async () => {
  clearError()
  const result = await window.space.stopTarget()
  if (!result.ok) showError(`Stop failed: ${result.error ?? "unknown"}`)
})

void init()
