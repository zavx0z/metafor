import type { Photon, BosonLogger } from "../index.t"
import type { Config } from "../web/logger.t"

// ANSI цветовые коды
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
}

// Конфигурация по умолчанию, аналогичная web-логгеру
const config: Config = {
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

function shortUUID(uuid: string): string {
  return uuid.slice(0, 8)
}

// Генерация различимых цветов (ANSI) из строки
const getAtomColor = (id: string): string => {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32bit integer
  }
  const colorPalette = [colors.cyan, colors.green, colors.yellow, colors.blue, colors.magenta]
  const index = Math.abs(hash) % colorPalette.length
  return colorPalette[index] as string
}

const getOpColor = (op: string): string => {
  switch (op) {
    case "add":
      return colors.green
    case "remove":
      return colors.red
    case "replace":
      return colors.yellow
    case "move":
      return colors.magenta
    case "copy":
      return colors.blue
    case "test":
      return colors.gray
    default:
      return colors.white
  }
}

const isLog = (message: BosonLogger): boolean =>
  Boolean(
    config.active &&
      config.path.includes(message.impulse.path as any) &&
      (!config.meta.length || config.meta.includes(message.meta)) &&
      (config.index === null || message.atom === String(config.index))
  )

/**
 * Основная функция логирования для сервера
 */
export function log(boson: BosonLogger): void {
  if (!isLog(boson)) return

  const timestamp = new Date().toLocaleTimeString("ru-RU", { hour12: false })
  const metaStr = String(boson.meta).padEnd(config.width.meta, " ")
  const pathStr = boson.path
  const atom = shortUUID(boson.atom)
  const op = String(boson.impulse.op).padEnd(config.width.op, " ")
  const path = String(boson.impulse.path).padEnd(config.width.path, " ")
  const initiator = centerText(boson.initiator, 4)
  const patch = boson.impulse

  let valueStr = ""
  if (patch.value !== undefined) {
    if (typeof patch.value === "object" && patch.value !== null) {
      valueStr = JSON.stringify(patch.value)
    } else {
      valueStr = String(patch.value)
    }
  }

  const atomColor = getAtomColor(atom)
  const opColor = getOpColor(patch.op)

  const logParts = [
    `${colors.gray}[${timestamp}]${colors.reset}`,
    `${atomColor}${atom}${colors.reset}`,
    `${opColor}${op}${colors.reset}`,
    `${colors.gray}|${colors.reset}`,
    `${colors.cyan}${path}${colors.reset}`,
    `${colors.gray}|${colors.reset}`,
    `${colors.yellow}${initiator}${colors.reset}`,
    `${colors.gray}|${colors.reset}`,
    `${colors.white}${metaStr}${colors.reset}`,
    `${colors.blue}${pathStr}${colors.reset}`,
  ]

  if (valueStr) {
    logParts.push(`${colors.gray}>>${colors.reset} ${colors.white}${valueStr.substring(0, 100)}${colors.reset}`)
  }

  console.log(logParts.join(" "))
}

/**
 * Функция-обертка для обработки сообщений
 */
export const logMsg = (data: Photon | any): void => {
  if (Object.hasOwn(data, "meta") && Object.hasOwn(data, "impulses")) {
    const { impulses, ...self } = data as Photon
    for (const impulse of impulses) {
      log({ ...self, impulse })
    }
  } else {
    // Логируем как есть, если структура не соответствует Photon
    const timestamp = new Date().toLocaleTimeString("ru-RU", { hour12: false })
    console.log(`${colors.gray}[${timestamp}]${colors.reset}`, data)
  }
}
