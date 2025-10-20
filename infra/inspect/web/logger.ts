//# sourceURL=log
import type { Config } from "./logger.t"
import type { Photon, BosonLogger } from "../index.t"

/**
 * Обертка с полным функционалом логирования для сериализации
 * Содержит все функции и конфигурацию для встраивания в воркер
 * @param userConfig - пользовательская конфигурация (необязательная)
 */
function createLoggerModule(userConfig: Partial<Config> = {}) {
  // Конфигурация логирования с значениями по умолчанию
  const defaultConfig: Config = {
    active: true,
    collapseAll: true,
    meta: [],
    index: null,
    patch: ["add", "remove", "replace", "move", "copy", "test"],
    path: ["/", "/context", "/state"],
    width: {
      meta: 22,
      op: 8,
      path: 8,
    },
    detail: {
      core: false,
    },
  }
  const centerText = (text: string, width: number): string => {
    const textStr = String(text)
    const padding = Math.max(0, width - textStr.length)
    const leftPad = Math.floor(padding / 2)
    const rightPad = padding - leftPad
    return " ".repeat(leftPad) + textStr + " ".repeat(rightPad)
  }
  // Объединяем конфигурацию по умолчанию с пользовательской
  const config: Config = {
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

  // Генерация различимых цветов (HSL) из строки без кеша
  const getAtomColor = (id: string): string => {
    // FNV-1a
    let hash = 2166136261 >>> 0
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    // Золотой угол для лучшего распределения оттенков
    const hue = Math.abs(hash * 137.508) % 360
    // Высокая светлота для читаемости черного текста
    const saturation = 70
    const lightness = 78
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }

  // Функция логирования ядра
  const logCore = (core: Record<string, any>): void => {
    console.log("snapshot debug: ", { ...core })
    console.log("current  debug: ", core)
  }

  // Функция проверки логирования
  const isLog = (message: BosonLogger, path: "/" | "/context" | "/state"): boolean =>
    Boolean(
      config.active &&
        message.impulse.path === path &&
        config.path.includes(path) &&
        (!config.meta.length || config.meta.includes(message.meta)) &&
        (config.index === null || message.atom === String(config.index))
    )

  // Основная функция логирования
  const log = (boson: BosonLogger): void => {
    const metaStr = String(boson.meta).padEnd(36, " ")
    const pathStr = boson.path
    const atom = boson.atom.includes("-") ? boson.atom.slice(boson.atom.lastIndexOf("-") + 1) : boson.atom
    const op = String(boson.impulse.op).padEnd(config.width.op, " ")
    const path = String(boson.impulse.path).padEnd(config.width.path, " ")
    const initiator = centerText(boson.initiator, 4)

    const patch = boson.impulse
    const stateValue = patch.value
      ? Array.isArray(patch.value)
        ? JSON.stringify(patch.value, null, 2)
        : typeof patch.value === "object" && patch.value !== null
        ? JSON.stringify(patch.value, null, 2)
        : patch.value
      : ""

    const value = patch.value ? formattedObj(patch.value) : ""
    const isError = patch.value ? Object.hasOwn(patch.value, "error") : ""
    const valLen = 22
    const valSlot = "".padEnd(valLen, " ")
    const baseStyles = [
      `background: ${getAtomColor(atom)}; color: #000; font-weight: bold; padding: 0 4px; border-radius: 6px`,
      "",
      `color: ${getOpColor(patch.op, patch.path)}; font-weight: bold`,
      "",
      "color: #2ecc71",
      "",
      "color: lightskyblue; font-weight: bold",
      "",
      "color: lightskyblue; font-weight: bold",
      "color: #3498db; font-weight: bold",
      "color: #3498db; font-weight: bold",
    ]
    const msgWithOutValue = [
      `%c${atom}%c %c${op}%c | %c${path}%c | %c${initiator}%c | %c${valSlot}%c${metaStr}%c${pathStr}`,
      ...baseStyles,
    ]

    const msgWithValue = [
      `%c${atom}%c %c${op}%c | %c${path}%c | %c${initiator}%c | %c${stateValue.padEnd(
        valLen,
        " "
      )}%c${metaStr}%c${pathStr}`,
      ...baseStyles.slice(0, 8),
      "color: lightskyblue; font-weight: bold",
      "color: #3498db; font-weight: bold",
      "color: #3498db; font-weight: bold",
    ]
    switch (true) {
      case isLog(boson, "/"):
        config.collapseAll ? console.groupCollapsed(...msgWithOutValue) : console.group(...msgWithOutValue)
        try {
          if (typeof patch.value === "object" && patch.value !== null) {
            console.log(value)
          } else console.log(patch.value)
        } finally {
          console.log(atom)
          console.groupEnd()
        }
        break
      case isLog(boson, "/context"):
        if (isError) console.group(...msgWithOutValue)
        else if (config.collapseAll) console.groupCollapsed(...msgWithOutValue)
        else console.group(...msgWithOutValue)
        try {
          if (typeof patch.value === "object" && patch.value !== null) {
            console.log(value)
          } else console.log(patch.value)
        } finally {
          console.log(atom)
          console.groupEnd()
        }
        break
      case isLog(boson, "/state"):
        config.collapseAll ? console.groupCollapsed(...msgWithValue) : console.group(...msgWithValue)
        try {
        } finally {
          console.log(atom)
          console.groupEnd()
        }
        break
    }
  }

  // Функция логирования сообщений
  const logMsg = (data: Photon | any): void => {
    if (Object.hasOwn(data, "meta")) {
      const { impulses, ...self } = data as Photon
      for (const impulse of impulses) log({ ...self, impulse })
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
export async function threadLog(config: Partial<Config> = {}): Promise<Worker> {
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
      new BroadcastChannel("electromagnetic").onmessage = (event) => {
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
