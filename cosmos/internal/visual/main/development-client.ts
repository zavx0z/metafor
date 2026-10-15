import {DEVELOPMENT_PATH, type DevelopmentObserver, type DevelopmentCatalog} from "../../../release/shared/development"
import type {DevelopmentSourceClient} from "./development-source"

type Socket = Pick<WebSocket, "addEventListener" | "removeEventListener" | "send" | "close">

/** Общий Chat получает snapshots из уже существующего /clients transport, без HTTP polling. */
export function createDevelopmentSocket(observe: DevelopmentObserver): Socket {
  const events = new EventTarget()
  let closed = false, stop: (() => void) | undefined
  const close = () => {if (closed) return; closed = true; stop?.(); queueMicrotask(() => events.dispatchEvent(new Event("close")))}
  queueMicrotask(() => {if (!closed) events.dispatchEvent(new Event("open"))})
  return {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    send(data) {
      if (closed || stop || typeof data !== "string") throw new Error("Invalid development subscription")
      const input = JSON.parse(data)
      if (input.type !== "subscribe" || typeof input.topic !== "string" || !input.topic.startsWith("chat:")) throw new Error("Expected chat subscription")
      const address = input.topic.slice(5)
      const release = observe({address, ...(input.executorId === undefined ? {} : {executorId: input.executorId}),
        ...(input.sessionId === undefined ? {} : {sessionId: input.sessionId})}, snapshot => {
        if (!closed) events.dispatchEvent(new MessageEvent("message", {data: JSON.stringify({type: "chat.snapshot", address, snapshot})}))
      }, error => {
        if (closed) return
        events.dispatchEvent(new MessageEvent("message", {data: JSON.stringify({type: "subscription.failed", message: error.message})}))
        close()
      })
      if (closed) release()
      else stop = release
    },
    close,
  }
}

/** HTTP только для явной команды/страницы истории; bearer другого приложения не используется. */
export const developmentChatFetcher: typeof fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
  const target = path === "/api/browser/registry-session" ? `${DEVELOPMENT_PATH}/reader`
    : path.startsWith("/api/browser/chat/") ? `${DEVELOPMENT_PATH}/chat/${path.slice("/api/browser/chat/".length)}` : null
  if (!target) return Promise.reject(new Error("Resource is outside the development transport"))
  return fetch(target, init)
}, {preconnect: fetch.preconnect}) as typeof fetch

export async function readDevelopmentCatalog(signal: AbortSignal): Promise<DevelopmentCatalog> {
  const response = await fetch(`${DEVELOPMENT_PATH}/catalog`, {signal})
  if (!response.ok) throw new Error("Хост не назначил рабочую область Cosmos")
  const value = await response.json()
  if (value.schema !== "cosmos:development/v1" || !Array.isArray(value.packages) || !Array.isArray(value.dependencies)) throw new Error("Неверный каталог Cosmos")
  return value
}

export const developmentSourceClient: DevelopmentSourceClient = {
  list: (packageName, path) => source("list", {packageName, ...(path === undefined ? {} : {path})}),
  read: (packageName, path) => source("read", {packageName, path}),
  save: (packageName, path, content, expectedHash) => source("save", {packageName, path, content, expectedHash}),
}
async function source(operation: string, body: object): Promise<any> {
  const reader = await fetch(`${DEVELOPMENT_PATH}/reader`, {method: "POST", headers: {"content-type": "application/json"}, body: "{}"})
  if (!reader.ok) throw new Error("Не удалось назначить Source request")
  const {readerToken} = await reader.json()
  const response = await fetch(`${DEVELOPMENT_PATH}/source/${operation}`, {method: "POST", headers: {"content-type": "application/json", "x-storybook-session": readerToken}, body: JSON.stringify(body)})
  const value = await response.json()
  if (!response.ok) throw Object.assign(new Error(value.error?.message ?? "Операция с исходником не подтверждена"), {status: response.status, code: value.error?.code})
  return value
}
