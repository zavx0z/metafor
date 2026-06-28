export type InterpreterRouteDescription = {
  method: string
  path: string
  description: string
}

const INTERPRETER_PROXY_PREFIX = "/hud/interpreter"
const INTERPRETER_PROXY_ALIASES = [INTERPRETER_PROXY_PREFIX, "/interp"] as const
const INTERPRETER_PROXY_EXACT_PATHS = new Set([
  "/",
  "/ws",
  "/health",
  "/context",
  "/viewport/screenshot",
  "/events",
  "/console",
  "/client-event",
  "/webrtc/signaling",
  "/webrtc/rooms",
  "/devtools/targets",
  "/devtools/state",
  "/devtools/console",
  "/devtools/console/clear",
  "/devtools/breakpoints",
  "/devtools/probe",
  "/devtools/reload",
  "/devtools/resume",
  "/devtools/disable",
  "/devtools/evaluate",
  "/gpu-crash-dumps",
  "/gpu-crash-dumps/latest",
  "/remote-desktop/health",
  "/remote-desktop/state",
  "/remote-desktop/status",
  "/remote-desktop/lifecycle",
  "/remote-desktop/rtc/state",
  "/remote-desktop/rtc/restart",
  "/remote-desktop/audio.pcm",
  "/remote-desktop/snapshot",
  "/remote-desktop/input",
  "/remote-desktop/browser/windows",
  "/remote-desktop/browser/open",
  "/processes",
  "/processes/resolve",
  "/processes/focus",
  "/hud/sqlite",
  "/hud/sqlite/dock",
  "/hud/sqlite/show",
  "/hud/sqlite/toggle",
  "/sqlite",
  "/sqlite/fingerprint",
  "/sqlite/open",
  "/sqlite/cell",
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
  {method: "WS", path: "/ws", description: "основной websocket UI интерпретатора; в app/web доступен как /hud/interpreter/ws или /interp/ws"},
  {method: "GET", path: "/space", description: "обзор визуального Space: рабочие поверхности и геометрия"},
  {method: "POST", path: "/space/focus", description: "{selector:{side|processId|moduleId|label|order}, dockHostTerminal?} — сфокусировать рабочую поверхность"},
  {method: "POST", path: "/space/frame", description: "показать все рабочие поверхности Space"},
  {method: "GET", path: "/context", description: "server-owned текущий active context: ровно текущий display/source/scopes/terminal"},
  {method: "GET", path: "/viewport/screenshot", description: "запросить PNG текущего viewport интерпретатора у подключенного UI-клиента и сохранить в tmp/codex-attachments"},
  {method: "WS", path: "/webrtc/signaling", description: "общий локальный WebRTC signaling для shared displays: remote desktop, Android и будущие video/datachannel peers"},
  {method: "GET", path: "/webrtc/rooms", description: "diagnostics текущих WebRTC signaling rooms/peers в этом interpreter host"},
  {method: "GET", path: "/devtools/targets", description: "Chrome CDP targets текущего server browser; default CDP 127.0.0.1:9349"},
  {method: "GET", path: "/devtools/state", description: "активные agent DevTools sessions/breakpoints/paused state"},
  {method: "GET", path: "/devtools/console", description: "последние browser console/log/exception/network errors текущего server Chrome target; query: limit, level, kind, sinceId"},
  {method: "POST", path: "/devtools/console/clear", description: "{targetUrl?|targetId?} — очистить buffered console events и Chrome console entries для target"},
  {method: "POST", path: "/devtools/breakpoints", description: "{source|url,line,column?,targetUrl?} — поставить CDP breakpoint; source строки 1-based и мапятся через sourcemap"},
  {method: "POST", path: "/devtools/probe", description: "{source|url,line,trigger?,autoResumeMs?} — поставить breakpoint, опционально дернуть trigger, дождаться pause и resume"},
  {method: "POST", path: "/devtools/reload", description: "{targetUrl?,hard?|ignoreCache?} — Page.reload текущего server Chrome target через CDP"},
  {method: "POST", path: "/devtools/resume", description: "{targetUrl?|targetId?} — продолжить выполнение paused Chrome target"},
  {method: "POST", path: "/devtools/disable", description: "{targetUrl?|targetId?|all?} — снять breakpoints, disable Debugger и закрыть agent CDP session"},
  {method: "POST", path: "/devtools/evaluate", description: "{expression,targetUrl?} — Runtime.evaluate в текущем server Chrome target"},
  {method: "GET", path: "/gpu-crash-dumps", description: "список сохраненных WebGPU crash diagnostic dumps, загруженных UI после unclean session"},
  {method: "GET", path: "/gpu-crash-dumps/latest", description: "последний полный WebGPU crash diagnostic dump из browser localStorage"},
  {method: "POST", path: "/gpu-crash-dumps", description: "UI загружает полный WebGPU crash diagnostic dump/ring buffer на host"},
  {method: "GET", path: "/browser-display/health", description: "proxy к локальному browser-host health endpoint; требует INTERPRETER_BROWSER_HOST_URL или INTERPRETER_BROWSER_HOST_PORT"},
  {method: "GET", path: "/browser-display/state", description: "proxy к локальному browser-host state для browser-display"},
  {method: "GET", path: "/browser-display/status", description: "alias к browser-display state для UI/status controls"},
  {method: "GET", path: "/browser-display/snapshot", description: "stream proxy к локальному browser-host snapshot; сохраняет content-type/content-length"},
  {method: "POST", path: "/browser-display/navigate", description: "{url} — proxy browser-host navigate"},
  {method: "POST", path: "/browser-display/reload", description: "{ignoreCache?|hard?} — proxy browser-host reload текущей страницы"},
  {method: "POST", path: "/browser-display/back", description: "proxy browser-host navigation back"},
  {method: "POST", path: "/browser-display/forward", description: "proxy browser-host navigation forward"},
  {method: "POST", path: "/browser-display/devtools", description: "{open?|toggle?} — proxy browser-host DevTools action"},
  {method: "POST", path: "/browser-display/fullscreen", description: "{enabled?} — proxy browser-host fullscreen action"},
  {method: "POST", path: "/browser-display/viewport", description: "{width,height,deviceScaleFactor?} — proxy browser-host viewport resize"},
  {method: "POST", path: "/browser-display/input", description: "proxy browser-host input event: pointer/keyboard/wheel/focus"},
  {method: "ANY", path: "/browser-display/proxy/*", description: "safe local proxy к configured browser-host relative path; absolute/non-loopback targets запрещены"},
  {method: "GET", path: "/remote-desktop/health", description: "proxy к локальному interpreter Chrome remote desktop host health; включает WebRTC state"},
  {method: "GET", path: "/remote-desktop/state", description: "alias к remote desktop health"},
  {method: "GET", path: "/remote-desktop/status", description: "alias к remote desktop health"},
  {method: "GET", path: "/remote-desktop/lifecycle", description: "status/schema единого lifecycle API server remote desktop: user-story, параметры и текущий display/sender state"},
  {method: "POST", path: "/remote-desktop/lifecycle", description: "{action,status|start|restart|recover|stop, scope?, wait?, timeoutMs?, cleanProfile?, stopXvfb?, config?} — единая точка поднятия/перезапуска/восстановления server remote desktop"},
  {method: "GET", path: "/remote-desktop/rtc/state", description: "state WebRTC sender внутри interpreter Chrome remote desktop host"},
  {method: "POST", path: "/remote-desktop/rtc/restart", description: "перезапустить WebRTC sender/capture page interpreter Chrome host"},
  {method: "GET", path: "/remote-desktop/audio.pcm", description: "stream proxy PipeWire PCM audio для same-origin Chrome WebRTC sender"},
  {method: "GET", path: "/remote-desktop/snapshot", description: "diagnostic PNG snapshot proxy, если configured host его поддерживает; не основной realtime display"},
  {method: "POST", path: "/remote-desktop/input", description: "control input в interpreter Chrome host или configured desktop input adapter"},
  {method: "GET", path: "/remote-desktop/browser/windows", description: "remote desktop browser/window adapter diagnostics, если configured"},
  {method: "POST", path: "/remote-desktop/browser/open", description: "{url} — открыть URL в managed server Chrome или configured browser adapter"},
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
  {method: "WS", path: "/hud/voice/wake/ws", description: "public proxy к локальному voice wake/Vosk WebSocket"},
  {method: "WS", path: "/hud/voice/asr/ws", description: "public proxy к локальному ASR WebSocket"},
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
  {method: "POST", path: "/client-event", description: "диагностическое событие от UI-клиента; пишет компактный client.* event в event-log"},
  {method: "POST", path: "/reload", description: "отправить hard reload всем подключенным UI-клиентам интерпретатора"},
  {method: "POST", path: "/restart", description: "перезапустить host interpreter через supervisor/tmux и предварительно обновить все UI-клиенты"},
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
  for (const prefix of INTERPRETER_PROXY_ALIASES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return normalizeInterpreterPath(pathname.slice(prefix.length) || "/")
    }
  }
  return null
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
