export type UiLocale = "ru" | "en"

const STORAGE_KEY = "interpreter:ui:locale"

let currentLocale: UiLocale = readInitialLocale()

export function getUiLocale(): UiLocale {
  return currentLocale
}

export function setUiLocale(locale: UiLocale): void {
  currentLocale = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export function toggleUiLocale(): UiLocale {
  const next = currentLocale === "ru" ? "en" : "ru"
  setUiLocale(next)
  return next
}

export function t(key: TextKey): string {
  return text[key][currentLocale]
}

export function tr(key: TextKey, locale: UiLocale): string {
  return text[key][locale]
}

export function localizeSystemText(value: string | null): string {
  if (value === null || value.trim().length === 0) return t("targetConnectHint")
  let out = value
  if (currentLocale === "ru") {
    out = out
      .replaceAll("socket closed", "сокет закрыт")
      .replaceAll("Failed to connect", "не удалось подключиться")
      .replaceAll("failed to connect", "не удалось подключиться")
      .replaceAll("fetch failed", "ошибка запроса")
      .replaceAll("spawn failed", "ошибка запуска")
      .replaceAll("unknown protocol error", "неизвестная ошибка protocol")
      .replaceAll("unknown", "неизвестно")
  }
  return out
}

function readInitialLocale(): UiLocale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "ru" || saved === "en") return saved
  return "ru"
}

export const text = {
  autoscrollOff: {ru: "Автоскролл выключен", en: "Autoscroll off"},
  autoscrollOn: {ru: "Автоскролл включён", en: "Autoscroll on"},
  auto: {ru: "Авто", en: "Auto"},
  clean: {ru: "без изменений", en: "clean"},
  close: {ru: "Закрыть", en: "Close"},
  clearVerbose: {ru: "Очистить события", en: "Clear events"},
  closure: {ru: "замыкания", en: "closure"},
  commandAccepted: {ru: "команда принята", en: "command accepted"},
  commandAlreadyRunning: {ru: "команда уже выполняется", en: "command already running"},
  commandExecuting: {ru: "Выполняется", en: "Executing"},
  commandFailed: {ru: "команда не выполнена", en: "command failed"},
  terminalTarget: {ru: "Вывод", en: "Output"},
  copyVerbose: {ru: "Скопировать события", en: "Copy events"},
  expressionUnavailable: {ru: "выражение недоступно: модуль не на паузе", en: "expression unavailable: module is not paused"},
  frames: {ru: "Стек", en: "Stack"},
  hideVerbose: {ru: "Скрыть события", en: "Hide events"},
  context: {ru: "Контекст", en: "Context"},
  contextConnected: {ru: "Контекст подключён", en: "Context connected"},
  contextFinished: {ru: "Контекст завершён", en: "Context finished"},
  contextOffline: {ru: "Контекст отключён", en: "Context offline"},
  interpreter: {ru: "Интерпретатор", en: "Interpreter"},
  langToggle: {ru: "Переключить язык", en: "Switch language"},
  lines: {ru: "строк", en: "lines"},
  local: {ru: "локальные", en: "local"},
  manual: {ru: "Вручную", en: "Manual"},
  noScopes: {ru: "нет областей для текущего фрейма", en: "no scopes for current frame"},
  noSource: {ru: "нет кода", en: "no source"},
  pause: {ru: "Пауза", en: "Pause"},
  pausePending: {ru: "ожидание паузы", en: "pause pending"},
  pauseRequested: {ru: "пауза запрошена", en: "pause requested"},
  reconnecting: {ru: "переподключение", en: "reconnecting"},
  resume: {ru: "Продолжить", en: "Resume"},
  restartTarget: {ru: "Перезапустить модуль", en: "Restart module"},
  run: {ru: "Идёт", en: "Running"},
  runExpression: {ru: "Выполнить выражение", en: "Run expression"},
  runStatus: {ru: "Выполнение", en: "Run"},
  runtimeActionUnavailable: {ru: "команда недоступна в текущем состоянии", en: "command unavailable in current state"},
  scopeValue: {ru: "значение scope", en: "scope value"},
  showExecutionPoint: {ru: "Показать точку остановки", en: "Show execution point"},
  showVerbose: {ru: "Показать события", en: "Show events"},
  socket: {ru: "Сокет", en: "Socket"},
  socketConnected: {ru: "Сокет подключён", en: "Socket connected"},
  socketClosed: {ru: "Сокет закрыт: модуль завершён", en: "Socket closed: module completed"},
  socketConnecting: {ru: "Сокет подключается", en: "Socket connecting"},
  socketDisconnected: {ru: "Сокет отключён", en: "Socket disconnected"},
  source: {ru: "Код", en: "Source"},
  sourceDisconnected: {ru: "контекст отключён", en: "context disconnected"},
  sourceExited: {ru: "модуль завершён", en: "module completed"},
  sourceFailed: {ru: "модуль завершился с ошибкой", en: "module failed"},
  sourceLastPaused: {ru: "последняя пауза", en: "last paused frame"},
  sourceLoading: {ru: "код загружается...", en: "loading source..."},
  sourceRunning: {ru: "модуль выполняется", en: "module running"},
  sourceWaiting: {ru: "ожидание кода в интерпретаторе", en: "waiting for interpreter source"},
  stepInto: {ru: "Шаг внутрь", en: "Step into"},
  stepOut: {ru: "Шаг наружу", en: "Step out"},
  stepOver: {ru: "Шаг без входа", en: "Step over"},
  stopTarget: {ru: "Остановить модуль", en: "Stop module"},
  target: {ru: "Модуль", en: "Module"},
  targetConnectHint: {ru: "Модуль не подключён к интерпретатору", en: "Module is not connected to interpreter"},
  targetExited: {ru: "завершена", en: "exited"},
  targetFailed: {ru: "ошибка запуска", en: "spawn failed"},
  targetIdle: {ru: "не запущен", en: "not started"},
  targetPaused: {ru: "пауза", en: "paused"},
  targetRunning: {ru: "выполняется", en: "running"},
  targetStarting: {ru: "запускается...", en: "starting..."},
  targetWaiting: {ru: "ожидание модуля...", en: "waiting for module..."},
  verbose: {ru: "События", en: "Events"},
  verboseEmpty: {ru: "поток событий контекста", en: "context event stream"},
  variables: {ru: "Переменные", en: "Variables"},
  waitingFrames: {ru: "ожидание фрейма на паузе", en: "waiting for paused frame"},
  waitingStdout: {ru: "ожидание stdout/stderr модуля...", en: "waiting for module stdout/stderr..."},
} as const

export type TextKey = keyof typeof text
