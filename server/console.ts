import type { Message } from "./metafor"

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

/**
 * Функция для цветного вывода debug логов
 */
export function log(event: MessageEvent<Message>) {
  const { meta, patches } = event.data
  const timestamp = new Date().toLocaleTimeString("ru-RU", { hour12: false })
  const tag = meta || "unknown"

  // Выводим каждый патч отдельно
  for (const patch of patches) {
    switch (patch.path) {
      case "/state":
        console.log(
          `${colors.gray}[${timestamp}]${colors.reset} ${colors.cyan}${tag.padEnd(20)}${colors.reset} | ${
            colors.yellow
          }STATE${colors.reset}  | ${colors.magenta}${patch.op.padEnd(8)}${colors.reset} | ${colors.green}${
            patch.value
          }${colors.reset}`
        )
        break
      case "/context":
        const contextStr = JSON.stringify(patch.value).substring(0, 50)
        console.log(
          `${colors.gray}[${timestamp}]${colors.reset} ${colors.cyan}${tag.padEnd(20)}${colors.reset} | ${
            colors.blue
          }CONTEXT${colors.reset}| ${colors.magenta}${patch.op.padEnd(8)}${colors.reset} | ${
            colors.white
          }${contextStr}${colors.reset}`
        )
        break
      case "/":
        console.log(
          `${colors.gray}[${timestamp}]${colors.reset} ${colors.cyan}${tag.padEnd(20)}${colors.reset} | ${
            colors.green
          }ADD${colors.reset}    | ${colors.magenta}${patch.op.padEnd(8)}${colors.reset} | ${colors.cyan}${tag}${
            colors.reset
          }`
        )
        break
      default:
        const path = patch.path as string
        console.log(
          `${colors.gray}[${timestamp}]${colors.reset} ${colors.cyan}${tag.padEnd(20)}${colors.reset} | ${
            colors.red
          }${path.padEnd(7)}${colors.reset} | ${colors.magenta}${patch.op.padEnd(8)}${colors.reset} | ${
            colors.white
          }${JSON.stringify(patch.value).substring(0, 30)}${colors.reset}`
        )
        break
    }
  }
}
