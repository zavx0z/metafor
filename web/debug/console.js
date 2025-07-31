const config = {
  active: true,
  // active: true,
  collapseAll: true,
  /**@type{Array<string>}*/
  tag: [
    // "graph-meta",
    // "graph-param"
    // "graph-state",
    // "graph-context",
    // "graph-layout"
    // "test",
    // "input-enum",
    // "graph-nodes",
    // "graph-listener",
    // "roadmap"
  ],
  index: null,
  patch: ["add", "remove", "replace", "move", "copy", "test"],
  /**@type{Array< "/" | "/context" | "/state" >}*/
  path: ["/", "/context", "/state"],
  // Ширины колонок
  width: {
    tag: 22,
    op: 8,
    path: 15,
  },
  detail: {
    core: false,
  },
}
/**
 *
 * @param {import("../../core/message/index.t").Message} message
 * @param {"/" | "/context" | "/state"} path
 * @returns {boolean}
 */
const isLog = ({ meta, patch }, path) =>
  Boolean(
    config.active &&
      patch.path === path &&
      config.path.includes(path) &&
      (!config.tag.length || config.tag.includes(meta.tag)) &&
      (config.index === null || meta.index === config.index)
  )

/**
 * @param {import("../../core/message/index.t").Message} message
 * @param {Record<string, any>} core
 */
export function log(message, core) {
  const { meta, patch } = message

  const tag = String(meta.tag).padEnd(config.width.tag, " ")
  const index = String(meta.index).padEnd(4, " ")
  const op = centerText(String(patch.op), config.width.op)
  const path = String(patch.path).padEnd(config.width.path, " ")

  const value = formattedObj(patch.value)
  const isError = Object.hasOwn(patch.value, "error")

  switch (true) {
    case isLog(message, "/"):
      ;(() => {
        const msg = [
          `%c${tag}${index}%c | %c${op}%c | %c${path}`,
          "color: #3498db; font-weight: bold",
          "",
          "color: #e74c3c",
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
          `%c${tag}${index}%c | %c${op}%c | %c${path}`,
          `color: #3498db; font-weight: bold; ${isError ? "background: #7d4545" : ""}`,
          "",
          "color: #e74c3c",
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
          `%c${tag}${index}%c | %c${op}%c | %c${path}%c %c${stateValue}`,
          "color: #3498db; font-weight: bold",
          "",
          "color: #e74c3c",
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

/**
 * Функция для центрирования текста
 *
 * @param {string} text
 * @param {number} width
 * @return {string}
 */
const centerText = (text, width) => {
  const padLeft = Math.floor((width - text.length) / 2)
  return text.padStart(padLeft + text.length, " ").padEnd(width, " ")
}

/**
 * Используем JSON.stringify для красивого вывода объекта
 *
 * @param {*} value
 * @return {string}
 */
const formattedObj = (value) =>
  JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, i, lines) => {
      // Не добавляем отступ для первой и последней строки
      if (i === 0 || i === lines.length - 1) {
        return line
      }
      return `${line}` // Добавляем отступ для вложенных строк
    })
    .join("\n")

/** @param {Record<string, any>} core */
const logCore = (core) => {
  console.log("snapshot debug: ", { ...core })
  console.log("current  debug: ", core)
}
