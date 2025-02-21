/**
 * @typedef {Object} WebSocketOptions
 * @property {string} url
 * @property {function({meta: {name: string}, patch: {op: string, path: string, value: any}}, WebSocket): void} onMessage
 * @property {function(WebSocket): void} [onOpen]
 * @property {function(WebSocket): void} [onClose]
 * @property {function(Event): void} [onError]
 */

/**
 * @param {WebSocketOptions} options
 * @returns {WebSocket}
 */
export function createWebSocketConnection(options) {
  const socket = new WebSocket(options.url)

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(/** @type {string} */ event.data)
    options.onMessage(data, socket) // Вызов функции обработки сообщений
  })

  socket.addEventListener("open", () => {
    if (options.onOpen) options.onOpen(socket) // Вызов функции при открытии соединения
  })

  socket.addEventListener("close", () => {
    console.log("Соединение закрыто. Повторная попытка подключения через 5 секунд...")
    if (options.onClose) options.onClose(socket) // Вызов функции при закрытии
    setTimeout(() => {
      createWebSocketConnection(options) // Повторный вызов
    }, 5000) // Задержка в 5 секунд перед повторным подключением
  })

  socket.addEventListener("error", (event) => {
    console.log("Ошибка соединения", event)
    if (options.onError) options.onError(event) // Вызов функции при ошибке
  })

  return socket
}

/**
 * @template {import('./types/index.ts').ContextDefinition} C
 *
 * @param {import('./QuantumAtom.js').QuantumAtom<any, any, any>} atom
 * @param {import("./types/index.ts").DebugOptions} options
 */
export default function (atom, options) {
  let ws
  let url = "ws://localhost:3000/debug"

  if (typeof options === 'object') {
    const {host, port} = options
    if (host && port) url = `ws://${host}:${port}/debug`
    if (!host && !port) url = `ws://localhost:3000/debug`
    if (!host && port) url = `ws://localhost:${port}/debug`
    if (host && !port) url = `ws://${host}/debug`
  }

  ws = createWebSocketConnection({
    url,
    onMessage: (data, socket) => {
      // Обработка входящих сообщений
      if (data.patch.path === "/" && data.patch.op === "test") {
        socket.send(
          JSON.stringify({
            meta: {id: atom.id},
            patch: {
              op: "add",
              path: `/${atom.id}`,
              value: atom.snapshot(),
            },
          })
        )
      }
      // if (data.meta.id !== atom.id) return
      if (data.patch && data.patch.op === "replace") {
        // console.log(data, "replace")
      }
    },
    onOpen: (socket) => {
      console.log(`${atom.id} Соединение открыто. ${socket.url}`)
      // Обработка открытия соединения
      socket.send(
        JSON.stringify({
          meta: {id: atom.id},
          patch: {
            op: "add",
            path: `/${atom.id}`,
            value: atom.snapshot(),
          },
        })
      )
    },
    onClose: () => {
      console.log("Соединение закрыто.")
    },
    onError: (event) => {
      console.log("Ошибка соединения:", event)
    },
  })

  atom.onCollapse((_, newState) => {
    ws.send(JSON.stringify({patch: {path: `/${atom.id}`, op: "replace", value: {state: newState}}}))
  })
  const originalUpdate = atom.update.bind(atom)
  // @ts-ignore
  atom.update = /** @param {import('./types/index.ts').ContextData<C>} context */(context) => {
    // @ts-ignore
    originalUpdate(context)
    ws.send(JSON.stringify({patch: {path: `/${atom.id}`, op: "replace", value: {context: context}}}))
  }
}