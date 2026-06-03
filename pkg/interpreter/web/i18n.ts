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
  hostTerminal: {ru: "Терминал", en: "Terminal"},
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
  terminalClosed: {ru: "закрыт", en: "closed"},
  terminalConnected: {ru: "подключён", en: "connected"},
  terminalConnecting: {ru: "подключение", en: "connecting"},
  terminalError: {ru: "ошибка терминала", en: "terminal error"},
  terminalExited: {ru: "процесс завершён", en: "process exited"},
  verbose: {ru: "События", en: "Events"},
  terminalWebsocket: {ru: "websocket", en: "websocket"},
  verboseEmpty: {ru: "поток событий контекста", en: "context event stream"},
  variables: {ru: "Переменные", en: "Variables"},
  voiceCommitting: {ru: "распознавание фрагмента", en: "committing voice chunk"},
  voiceAutoEnter: {ru: "autoenter", en: "autoenter"},
  voiceConnecting: {ru: "подключение голоса", en: "voice connecting"},
  voiceError: {ru: "ошибка голоса", en: "voice error"},
  voiceIdle: {ru: "микрофон выключен", en: "microphone off"},
  voiceInput: {ru: "Голосовой ввод", en: "Voice input"},
  voiceInserted: {ru: "введено голосом", en: "voice inserted"},
  voiceListening: {ru: "диктовка активна", en: "dictation active"},
  voiceNoActiveInput: {ru: "активный ввод недоступен", en: "active input unavailable"},
  voiceNoTarget: {ru: "кликни в терминал или ввод интерпретатора", en: "click terminal or interpreter input"},
  voiceServiceDown: {ru: "ASR недоступен", en: "ASR unavailable"},
  voiceServiceOk: {ru: "ASR работает", en: "ASR ok"},
  voiceServiceUnknown: {ru: "ASR не проверен", en: "ASR unchecked"},
  voiceSettingsTab: {ru: "Настройки", en: "Settings"},
  voiceDebugTab: {ru: "Отладка", en: "Debug"},
  voiceActivationPhrases: {ru: "Активация", en: "Activation"},
  voiceDeactivationPhrases: {ru: "Деактивация", en: "Deactivation"},
  voiceStopPhrases: {ru: "Остановка", en: "Stop"},
  voiceActivationDescription: {ru: "Запускает диктовку из режима ожидания.", en: "Starts dictation from wake waiting."},
  voiceDeactivationDescription: {ru: "Например: выключи микрофон. Диктовка гаснет, wake-up остается.", en: "For example: turn off microphone. Dictation stops, wake-up stays on."},
  voiceStopDescription: {ru: "Только явные фразы полной остановки: микрофон выключается целиком.", en: "Only explicit full-stop phrases: the microphone turns fully off."},
  voiceActivationWhen: {ru: "Когда: микрофон ждет wake-up фразу.", en: "When: the mic is waiting for a wake phrase."},
  voiceActivationEffect: {ru: "Что происходит: включается ASR-диктовка.", en: "Effect: ASR dictation starts."},
  voiceDeactivationWhen: {ru: "Когда: диктовка уже активна.", en: "When: dictation is already active."},
  voiceDeactivationEffect: {ru: "Что происходит: ASR гаснет, wake-up остается.", en: "Effect: ASR stops, wake-up stays on."},
  voiceStopWhen: {ru: "Когда: нужно полностью выключить голос.", en: "When: voice input must be fully off."},
  voiceStopEffect: {ru: "Что происходит: ASR, wake-up и микрофон закрываются.", en: "Effect: ASR, wake-up, and mic are closed."},
  voiceActivationPhrasePrompt: {ru: "Фраза активации", en: "Activation phrase"},
  voiceDeactivationPhrasePrompt: {ru: "Фраза деактивации", en: "Deactivation phrase"},
  voiceStopPhrasePrompt: {ru: "Фраза остановки", en: "Stop phrase"},
  voicePhraseAdd: {ru: "Добавить", en: "Add"},
  voicePhraseReset: {ru: "Сброс", en: "Reset"},
  voiceStart: {ru: "Начать голосовой ввод", en: "Start voice input"},
  voiceStop: {ru: "Остановить голосовой ввод", en: "Stop voice input"},
  voiceTarget: {ru: "Цель", en: "Target"},
  voiceTargetHost: {ru: "терминал", en: "terminal"},
  voiceTargetModule: {ru: "интерпретатор", en: "interpreter"},
  voiceWaitingWake: {ru: "жду: Завхоз", en: "waiting: Zavhoz"},
  voiceWakeAdd: {ru: "Добавить", en: "Add"},
  voiceWakePhrasePrompt: {ru: "Wake-up фраза", en: "Wake-up phrase"},
  voiceWakePhrases: {ru: "Wake-up фразы", en: "Wake-up phrases"},
  voiceWakeReset: {ru: "Сброс", en: "Reset"},
  waitingFrames: {ru: "ожидание фрейма на паузе", en: "waiting for paused frame"},
  waitingStdout: {ru: "ожидание stdout/stderr модуля...", en: "waiting for module stdout/stderr..."},
} as const

export type TextKey = keyof typeof text
