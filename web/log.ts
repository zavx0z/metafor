//# sourceURL=log
import type { LogMessage, LogData, LogConfig } from "./log.t"

/**
 * Обертка с полным функционалом логирования для сериализации
 * Содержит все функции и конфигурацию для встраивания в воркер
 * @param userConfig - пользовательская конфигурация (необязательная)
 */
function createLoggerModule(userConfig: Partial<LogConfig> = {}) {
  // Конфигурация логирования с значениями по умолчанию
  const defaultConfig: LogConfig = {
    active: true,
    collapseAll: true,
    meta: [],
    index: null,
    patch: ["add", "remove", "replace", "move", "copy", "test"],
    path: ["/", "/context", "/state"],
    width: {
      meta: 22,
      op: 10,
      path: 15,
    },
    detail: {
      core: false,
    },
  }

  // Объединяем конфигурацию по умолчанию с пользовательской
  const config: LogConfig = {
    ...defaultConfig,
    ...userConfig,
    width: {
      ...defaultConfig.width,
      ...userConfig.width,
    },
    detail: {
      ...defaultConfig.detail,
      ...userConfig.detail,
    },
  }

  // Функция получения цвета для операций
  const getOpColor = (op: string, path: string): string => {
    if (path === "/state") {
      switch (op) {
        case "test":
          return "#1c8447"
        case "replace":
          return "#27ae60"
      }
    }

    switch (op) {
      case "add":
        return "#ecf0f1"
      case "remove":
        return "#e74c3c"
      case "replace":
        return "#3c3c3c"
      case "move":
        return "#9b59b6"
      case "copy":
        return "#3498db"
      case "test":
        return "#95a5a6"
      default:
        return "#34495e"
    }
  }

  // Функция форматирования объектов
  const formattedObj = (value: any): string =>
    JSON.stringify(value, null, 2)
      .split("\n")
      .map((line, i, lines) => {
        if (i === 0 || i === lines.length - 1) {
          return line
        }
        return `${line}`
      })
      .join("\n")

  // Функция логирования ядра
  const logCore = (core: Record<string, any>): void => {
    console.log("snapshot debug: ", { ...core })
    console.log("current  debug: ", core)
  }

  // Функция проверки логирования
  const isLog = (message: LogMessage, path: "/" | "/context" | "/state"): boolean =>
    Boolean(
      config.active &&
        message.patch.path === path &&
        config.path.includes(path) &&
        (!config.meta.length || config.meta.includes(message.meta)) &&
        (config.index === null || message.actor === String(config.index))
    )

  // Основная функция логирования
  const log = (message: LogMessage, core: Record<string, any> = {}): void => {
    const { meta, actor, path: actorPath, patch } = message

    const metaStr = String(meta).padEnd(config.width.meta, " ")
    const actorStr = String(actor).padEnd(40, " ")
    const pathStr = String(actorPath).padEnd(8, " ")
    const op = String(patch.op).padEnd(config.width.op, " ")
    const path = String(patch.path).padEnd(config.width.path, " ")

    const value = patch.value ? formattedObj(patch.value) : ""
    const isError = patch.value ? Object.hasOwn(patch.value, "error") : ""

    switch (true) {
      case isLog(message, "/"):
        ;(() => {
          const msg = [
            `%c${metaStr}%c${actorStr}%c${pathStr}%c  |  %c${op}%c  |  %c${path}`,
            "color: #3498db; font-weight: bold",
            "color: #9b59b6; font-weight: bold",
            "color: #f39c12; font-weight: bold",
            "",
            `color: ${getOpColor(patch.op, patch.path)}; font-weight: bold`,
            "",
            "color: #2ecc71",
          ]
          config.collapseAll ? console.groupCollapsed(...msg) : console.group(...msg)

          if (typeof patch.value === "object" && patch.value !== null) {
            console.log(value)
            config.detail.core && logCore(core)
          } else console.log(patch.value)

          console.groupEnd()
        })()
        break
      case isLog(message, "/context"):
        ;(() => {
          const msg = [
            `%c${metaStr}%c${actorStr}%c${pathStr}%c  |  %c${op}%c  |  %c${path}`,
            `color: #3498db; font-weight: bold; ${isError ? "background: #7d4545" : ""}`,
            "color: #9b59b6; font-weight: bold",
            "color: #f39c12; font-weight: bold",
            "",
            `color: ${getOpColor(patch.op, patch.path)}; font-weight: bold`,
            "",
            "color: #2ecc71",
          ]

          if (isError) console.group(...msg)
          else if (config.collapseAll) console.groupCollapsed(...msg)
          else console.group(...msg)

          try {
            if (typeof patch.value === "object" && patch.value !== null) {
              console.log(value)
              config.detail.core && logCore(core)
            } else console.log(patch.value)
          } finally {
            console.groupEnd()
          }
        })()
        break
      case isLog(message, "/state"):
        ;(() => {
          const stateValue = Array.isArray(patch.value)
            ? JSON.stringify(patch.value, null, 2)
            : typeof patch.value === "object" && patch.value !== null
              ? JSON.stringify(patch.value, null, 2)
              : patch.value

          const msg = [
            `%c${metaStr}%c${actorStr}%c${pathStr}%c  |  %c${op}%c  |  %c${path}%c  %c${stateValue}`,
            "color: #3498db; font-weight: bold",
            "color: #9b59b6; font-weight: bold",
            "color: #f39c12; font-weight: bold",
            "",
            `color: ${getOpColor(patch.op, patch.path)}; font-weight: bold`,
            "",
            "color: #2ecc71",
            "",
            "color: lightskyblue; font-weight: bold",
          ]
          config.collapseAll ? console.groupCollapsed(...msg) : console.group(...msg)
          try {
            config.detail.core && logCore(core)
          } finally {
            console.groupEnd()
          }
        })()
        break
    }
  }

  // Функция логирования сообщений
  const logMsg = (data: LogData | any, core: Record<string, any> = {}): void => {
    if (Object.hasOwn(data, "meta")) {
      const { meta, actor, path, patches, timestamp } = data as LogData
      for (const patch of patches) {
        log({ meta, patch, timestamp, actor, path }, core)
      }
    } else {
      console.log(data)
    }
  }

  return { log, logMsg }
}

// Создаем экземпляр модуля для экспорта с конфигурацией по умолчанию
const loggerModule = createLoggerModule()

// Экспортируем функции из модуля
export const log = loggerModule.log
export const logMsg = loggerModule.logMsg

/**
 * Создает воркер для логирования в отдельном потоке
 * @param config - конфигурация логирования (все параметры необязательные)
 * @returns Promise с готовым воркером
 */
export async function threadLog(config: Partial<LogConfig> = {}): Promise<Worker> {
  return new Promise((resolve, reject) => {
    // Получаем полный код модуля для встраивания в воркер
    const moduleCode = createLoggerModule.toString()

    // Создаем код воркера с передачей конфигурации
    const workerCode = `
      //# sourceURL=log
      // Встраиваем весь модуль логирования с конфигурацией
      const loggerModule = (${moduleCode})(${JSON.stringify(config)})
      const { log, logMsg } = loggerModule
      
      // Создаем BroadcastChannel для получения сообщений от акторов
      new BroadcastChannel("actor-force").onmessage = (event) => {
        logMsg(event.data);
      };
      
      // Уведомляем основной поток о готовности
      self.postMessage({ type: "worker-ready" });
    `

    // Создаем Blob с кодом воркера
    const blob = new Blob([workerCode], { type: "application/javascript" })
    const workerUrl = URL.createObjectURL(blob)

    // Создаем воркер
    const worker = new Worker(workerUrl, { type: "module" })

    // Обработчик сообщений от воркера
    worker.onmessage = (event) => {
      if (event.data.type === "worker-ready") {
        // Воркер готов, очищаем URL и резолвим Promise
        URL.revokeObjectURL(workerUrl)
        resolve(worker)
      }
    }

    // Обработчик ошибок воркера
    worker.onerror = (error) => {
      URL.revokeObjectURL(workerUrl)
      reject(error)
    }

    // Таймаут для случая, если воркер не отвечает
    setTimeout(() => {
      URL.revokeObjectURL(workerUrl)
      reject(new Error("Worker initialization timeout"))
    }, 5000)
  })
}
