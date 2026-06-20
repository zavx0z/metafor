export type InterpreterRouteDescription = {
  method: string
  path: string
  description: string
}

const INTERPRETER_PROXY_PREFIX = "/hud/interpreter"
const INTERPRETER_PROXY_EXACT_PATHS = new Set([
  "/",
  "/health",
  "/context",
  "/events",
  "/console",
  "/processes",
  "/processes/resolve",
  "/processes/focus",
])
const INTERPRETER_PROXY_PROCESS_SUBPATHS = new Set([
  "",
  "action",
  "apply_patch",
  "apply-patch",
  "breakpoint",
  "breakpoints",
  "context",
  "focus",
  "modules",
  "source",
])

const routeIndex = [
  {method: "GET", path: "/health", description: "статус коннекта и параметры"},
  {method: "GET", path: "/space", description: "обзор визуального Space: рабочие поверхности и геометрия"},
  {method: "POST", path: "/space/focus", description: "{selector:{side|processId|moduleId|label|order}, dockHostTerminal?} — сфокусировать рабочую поверхность"},
  {method: "POST", path: "/space/frame", description: "показать все рабочие поверхности Space"},
  {method: "GET", path: "/context", description: "server-owned текущий active context: ровно текущий display/source/scopes/terminal"},
  {method: "GET", path: "/processes", description: "список runtime processes интерпретатора"},
  {method: "POST", path: "/processes", description: "{label?, command, cwd?, env?, pauseOnStart?, breakpoints?} — запустить новый runtime process"},
  {method: "POST", path: "/processes/resolve", description: "{selector:{side|processId|moduleId|label|order}} — найти process по текущему Space"},
  {method: "POST", path: "/processes/focus", description: "{selector:{side|processId|moduleId|label|order}, dockHostTerminal?} — сфокусировать process"},
  {method: "GET", path: "/processes/:id", description: "рабочий payload process: content + runtime/ui state/capabilities"},
  {method: "POST", path: "/processes/:id/focus", description: "сфокусировать конкретный process"},
  {method: "DELETE", path: "/processes/:id", description: "остановить runtime process и убрать его display из Space"},
  {method: "POST", path: "/processes/:id/action", description: "{action, params?} — выполнить pause|resume|step|setBreakpointsActive|muteBreakpoints|unmuteBreakpoints|evaluate|source.open({path,line?,column?,selection?})|source.openSelection|restart|stop|close|showExecutionPoint"},
  {method: "GET", path: "/processes/:id/context", description: "текущий context конкретного process"},
  {method: "GET", path: "/processes/:id/modules?q=<text>&limit=<n>", description: "каталог кода в контексте process"},
  {method: "GET", path: "/processes/:id/source?scriptId=<id>", description: "исходник в контексте process"},
  {method: "POST", path: "/processes/:id/source", description: "{sourceUrl, text} — сохранить локальный source file через apply_patch"},
  {method: "POST", path: "/processes/:id/apply_patch", description: "raw apply_patch text — применить apply_patch к workspace process"},
  {method: "GET", path: "/processes/:id/breakpoints", description: "breakpoint registrations конкретного process"},
  {method: "POST", path: "/processes/:id/breakpoint", description: "{url|sourceUrl|urlRegex, line, column?, condition?} — breakpoint в конкретном process"},
  {method: "DELETE", path: "/processes/:id/breakpoint", description: "{id|breakpointId} — убрать breakpoint из конкретного process"},
  {method: "GET", path: "/hud/terminal", description: "состояние host terminal HUD"},
  {method: "POST", path: "/hud/terminal/dock", description: "свернуть host terminal HUD"},
  {method: "POST", path: "/hud/terminal/show", description: "развернуть host terminal HUD"},
  {method: "POST", path: "/hud/terminal/toggle", description: "переключить host terminal HUD"},
  {method: "GET", path: "/hud/terminal/network", description: "состояние второй network terminal HUD"},
  {method: "POST", path: "/hud/terminal/network/show", description: "сфокусировать network display в Space"},
  {method: "POST", path: "/hud/terminal/network/dock", description: "оставить network tmux в Space без плавающего HUD"},
  {method: "POST", path: "/hud/terminal/network/toggle", description: "сфокусировать network display в Space"},
  {method: "POST", path: "/space/network/action", description: "{action} — управлять tmux network layout: layout/status/start:tls/stop:tls/start:redirect/stop:redirect/tail/clear"},
  {method: "GET", path: "/hud/android", description: "состояние Android HUD"},
  {method: "POST", path: "/hud/android/show", description: "развернуть Android HUD"},
  {method: "POST", path: "/hud/android/dock", description: "свернуть Android HUD"},
  {method: "POST", path: "/hud/android/toggle", description: "переключить Android HUD"},
  {method: "POST", path: "/hud/android/refresh", description: "обновить Android frame"},
  {method: "POST", path: "/hud/android/control", description: "отправить Android command через WebRTC datachannel без ADB"},
  {method: "GET", path: "/hud/android/secondary", description: "состояние второго Android HUD"},
  {method: "POST", path: "/hud/android/secondary/show", description: "развернуть второй Android HUD"},
  {method: "POST", path: "/hud/android/secondary/dock", description: "свернуть второй Android HUD"},
  {method: "POST", path: "/hud/android/secondary/toggle", description: "переключить второй Android HUD"},
  {method: "POST", path: "/hud/android/secondary/control", description: "отправить command во второй Android через WebRTC datachannel"},
  {method: "WS", path: "/hud/android/webrtc/signaling", description: "WebRTC signaling для Android APK video/datachannel"},
  {method: "GET", path: "/android/size", description: "proxy к Android panel API: размер устройства"},
  {method: "GET", path: "/android/screencap", description: "proxy к Android panel API: текущий PNG frame"},
  {method: "POST", path: "/android/tap", description: "{x,y} — proxy Android tap"},
  {method: "POST", path: "/android/swipe", description: "{x1,y1,x2,y2,durationMs?} — proxy Android swipe"},
  {method: "POST", path: "/android/key", description: "{code} — proxy Android keyevent"},
  {method: "WS", path: "/hud/terminal/stream", description: "host PTY terminal stream"},
  {method: "GET", path: "/hud/terminal/sessions", description: "host PTY session diagnostics"},
  {method: "GET", path: "/hud/todo", description: "прочитать TODO.md и parsed items для HUD ToDoPane"},
  {method: "PUT", path: "/hud/todo", description: "{text} — заменить TODO.md целиком"},
  {method: "POST", path: "/hud/todo/items", description: "{text, kind?, checked?, depth?, afterId?} — добавить пункт TODO.md"},
  {method: "PATCH", path: "/hud/todo/items/:id", description: "{text?, checked?} — изменить текст или markdown checkbox пункта"},
  {method: "DELETE", path: "/hud/todo/items/:id", description: "удалить пункт TODO.md"},
  {method: "GET", path: "/hud/todo/panel", description: "состояние HUD ToDoPane: rect/dock/highlight"},
  {method: "POST", path: "/hud/todo/highlight", description: "{id|ids|highlightedIds} — подсветить пункты в HUD для context агента"},
  {method: "POST", path: "/hud/todo/dock", description: "свернуть TODO HUD"},
  {method: "POST", path: "/hud/todo/show", description: "развернуть TODO HUD"},
  {method: "POST", path: "/hud/todo/toggle", description: "переключить TODO HUD"},
  {method: "GET", path: "/hud/sqlite", description: "состояние SQLite HUD: active database, rect/dock"},
  {method: "POST", path: "/hud/sqlite/dock", description: "свернуть SQLite HUD"},
  {method: "POST", path: "/hud/sqlite/show", description: "развернуть SQLite HUD"},
  {method: "POST", path: "/hud/sqlite/toggle", description: "переключить SQLite HUD"},
  {method: "GET", path: "/sqlite?path=<file.sqlite>&table=<name>&notBefore=<iso>", description: "просмотреть SQLite database tables/schema/rows; notBefore отсекает файл предыдущего запуска"},
  {method: "GET", path: "/sqlite/fingerprint?path=<file.sqlite>", description: "дешевый fingerprint SQLite database по main/WAL для diagnostics/server watcher; SHM только diagnostic"},
  {method: "POST", path: "/sqlite/open", description: "{path} — открыть SQLite database в HUD"},
  {method: "POST", path: "/sqlite/cell", description: "{path, table, rowid, column, value} — обновить SQLite cell по rowid"},
  {method: "GET", path: "/events?since=<iso>&limit=<n>", description: "хвост event-лога"},
  {method: "GET", path: "/console?since=<iso>&limit=<n>", description: "хвост console-лога"},
] as const satisfies readonly InterpreterRouteDescription[]

export const interpreterRoutes = {
  index: routeIndex,
  proxy: {
    prefix: INTERPRETER_PROXY_PREFIX,
    toUpstreamPath: interpreterProxyUpstreamPath,
    acceptsPath: isInterpreterProxyPath,
    acceptsPathname: isInterpreterProxyPathname,
  },
} as const

function interpreterProxyUpstreamPath(pathname: string): string | null {
  if (pathname !== INTERPRETER_PROXY_PREFIX && !pathname.startsWith(`${INTERPRETER_PROXY_PREFIX}/`)) return null
  return normalizeInterpreterPath(pathname.slice(INTERPRETER_PROXY_PREFIX.length) || "/")
}

function isInterpreterProxyPathname(pathname: string): boolean {
  const upstreamPath = interpreterProxyUpstreamPath(pathname)
  return upstreamPath !== null && isInterpreterProxyPath(upstreamPath)
}

function isInterpreterProxyPath(path: string): boolean {
  const normalized = normalizeInterpreterPath(path)
  if (INTERPRETER_PROXY_EXACT_PATHS.has(normalized)) return true
  const match = /^\/processes\/[^/]+(?:\/([^/]+))?$/.exec(normalized)
  if (match === null) return false
  return INTERPRETER_PROXY_PROCESS_SUBPATHS.has(match[1] ?? "")
}

function normalizeInterpreterPath(path: string): string {
  const clean = path.trim()
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`
  return withSlash.replace(/\/+$/, "") || "/"
}
