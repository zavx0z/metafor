export type UiLocale = "ru" | "en"

const STORAGE_KEY = "bd:ui:locale"

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
      .replaceAll("unknown inspector error", "неизвестная ошибка inspector")
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
  applyInspector: {ru: "Применить inspector URL", en: "Apply inspector URL"},
  clean: {ru: "без изменений", en: "clean"},
  clearVerbose: {ru: "Очистить события", en: "Clear events"},
  closure: {ru: "замыкания", en: "closure"},
  commandAccepted: {ru: "команда принята", en: "command accepted"},
  commandAlreadyRunning: {ru: "команда уже выполняется", en: "command already running"},
  commandExact: {ru: "BRK на старте использует --inspect-brk.", en: "BRK on start uses --inspect-brk."},
  commandExecuting: {ru: "Выполняется", en: "Executing"},
  commandFailed: {ru: "команда не выполнена", en: "command failed"},
  consoleTarget: {ru: "Вывод", en: "Output"},
  dirty: {ru: "есть изменения", en: "dirty"},
  draft: {ru: "Черновик", en: "Draft"},
  draftDirty: {ru: "Черновик*", en: "Draft dirty"},
  draftNoSource: {ru: "нет кода", en: "no source"},
  draftSaved: {ru: "черновик сохранён в памяти", en: "draft saved in memory"},
  editDraft: {ru: "Редактировать черновик", en: "Edit draft"},
  evalExpression: {ru: "Eval-выражение", en: "Eval expression"},
  evalFrame: {ru: "Eval на фрейме", en: "Eval on frame"},
  frames: {ru: "Стек", en: "Stack"},
  hideVerbose: {ru: "Скрыть события", en: "Hide events"},
  inspector: {ru: "Инспектор", en: "Inspector"},
  inspectorConnected: {ru: "Инспектор подключён", en: "Inspector connected"},
  inspectorOffline: {ru: "Инспектор отключён", en: "Inspector offline"},
  interpreter: {ru: "Интерпретатор", en: "Interpreter"},
  langToggle: {ru: "Переключить язык", en: "Switch language"},
  lines: {ru: "строк", en: "lines"},
  local: {ru: "локальные", en: "local"},
  manual: {ru: "Вручную", en: "Manual"},
  noScopes: {ru: "нет областей для текущего фрейма", en: "no scopes for current frame"},
  noSource: {ru: "нет кода", en: "no source"},
  pause: {ru: "Пауза", en: "Pause"},
  pauseOff: {ru: "BRK на старте: выкл", en: "BRK on start: off"},
  pauseOn: {ru: "BRK на старте: вкл", en: "BRK on start: on"},
  pausePending: {ru: "ожидание паузы", en: "pause pending"},
  pauseRequested: {ru: "пауза запрошена", en: "pause requested"},
  pending: {ru: "ожидает", en: "pending"},
  reconnecting: {ru: "переподключение", en: "reconnecting"},
  resume: {ru: "Продолжить", en: "Resume"},
  restartTarget: {ru: "Перезапустить процесс", en: "Restart process"},
  run: {ru: "Идёт", en: "Running"},
  runEval: {ru: "Выполнить eval", en: "Run eval"},
  runStatus: {ru: "Выполнение", en: "Run"},
  runTarget: {ru: "Запустить процесс", en: "Run process"},
  saveDraft: {ru: "Сохранить черновик в памяти", en: "Save draft in memory"},
  savedInMemory: {ru: "сохранён в памяти", en: "saved in memory"},
  scopesEval: {ru: "Переменные / Eval", en: "Variables / Eval"},
  showSource: {ru: "Показать source", en: "View source"},
  showVerbose: {ru: "Показать события", en: "Show events"},
  socket: {ru: "Сокет", en: "Socket"},
  socketConnected: {ru: "Сокет подключён", en: "Socket connected"},
  socketConnecting: {ru: "Сокет подключается", en: "Socket connecting"},
  socketDisconnected: {ru: "Сокет отключён", en: "Socket disconnected"},
  source: {ru: "Код", en: "Source"},
  sourceDisconnected: {ru: "инспектор отключён", en: "inspector disconnected"},
  sourceLastPaused: {ru: "последняя пауза", en: "last paused frame"},
  sourceLoading: {ru: "код загружается...", en: "loading source..."},
  sourceRunning: {ru: "процесс выполняется", en: "process running"},
  sourceWaiting: {ru: "ожидание кода на паузе", en: "waiting for paused source"},
  stepInto: {ru: "Шаг внутрь", en: "Step into"},
  stepOut: {ru: "Шаг наружу", en: "Step out"},
  stepOver: {ru: "Шаг без входа", en: "Step over"},
  stopTarget: {ru: "Остановить процесс", en: "Stop process"},
  target: {ru: "Процесс", en: "Process"},
  targetConnectHint: {ru: "Процесс не подключён к инспектору", en: "Process is not attached to inspector"},
  targetExited: {ru: "завершена", en: "exited"},
  targetFailed: {ru: "ошибка запуска", en: "spawn failed"},
  targetIdle: {ru: "не запущен", en: "not started"},
  targetPaused: {ru: "пауза", en: "paused"},
  targetRunning: {ru: "выполняется", en: "running"},
  targetStarting: {ru: "запускается...", en: "starting..."},
  targetWaiting: {ru: "ожидание процесса...", en: "waiting for process..."},
  toggleDraft: {ru: "Черновик", en: "Draft"},
  verbose: {ru: "События", en: "Events"},
  verboseEmpty: {ru: "поток inspector и agent", en: "inspector and agent stream"},
  waitingFrames: {ru: "ожидание фрейма на паузе", en: "waiting for paused frame"},
  waitingStdout: {ru: "ожидание stdout/stderr процесса...", en: "waiting for process stdout/stderr..."},
} as const

export type TextKey = keyof typeof text
