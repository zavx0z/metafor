/**
 * Браузерный entrypoint для Dark.
 *
 * Пока не подключён: реляционный store через `store/server.ts` поднимается на Bun SQL,
 * а browser-backend (IDB или иной) ещё не реализован. До его появления этот файл
 * только сообщает об ограничении, чтобы build не падал на отсутствующих legacy-модулях.
 */
const message = "dark/web.ts: browser store backend ещё не реализован — Dark в браузере пока не запускается"

if (typeof console !== "undefined") {
  console.warn(message)
}

throw new Error(message)
