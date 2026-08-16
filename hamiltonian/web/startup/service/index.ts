/**
 * Event entrypoint неизменяемой Service Worker оболочки `@startup/service`.
 *
 * Install и activate немедленно передают новой инкарнации управление. Первое
 * `connect` message продлевает жизнь события до подготовки startup cache,
 * получает и запускает Service Worker release через универсальный loader API
 * и ждёт его завершения. Все GET requests после захвата страницы проходят
 * через cache-first policy.
 *
 * @packageDocumentation
 */

import {cacheFirst, cacheStartup} from "./cache"
import * as loader from "./loader"

const serviceReleaseRequest = new Request(new URL("/code?module=@release/service", location.origin))

let serviceRelease: Promise<void> | null = null

addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(skipWaiting())
})

addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clients.claim())
})

addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type !== "connect") return
  event.waitUntil(Promise.all([cacheStartup(), loadServiceRelease()]))
})

addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return
  event.respondWith(cacheFirst(event.request))
})

/**
 * Загружает и один раз за инкарнацию запускает Service Worker release.
 *
 * Одновременные события используют один Promise. После ошибки ссылка
 * освобождается, поэтому следующее событие может повторить полную загрузку.
 */
async function loadServiceRelease() {
  serviceRelease ??= startServiceRelease()

  try {
    await serviceRelease
  } catch (error) {
    serviceRelease = null
    throw error
  }
}

/** Получает release, сохраняет его bytes и передаёт ему универсальный API. */
async function startServiceRelease() {
  try {
    let response = await loader.read("release", serviceReleaseRequest)

    if (!response) {
      response = loader.verify(await fetch(serviceReleaseRequest))
      await loader.cache("release", serviceReleaseRequest, response)
      response = await loader.read("release", serviceReleaseRequest)
    }

    if (!response) throw new Error("Cached Service Worker release is missing")

    loader.verify(response)
    const module = {exports: {}} as {
      exports: {default: (loaderApi: typeof loader) => Promise<void>}
    }
    loader.run(await response.text(), {module})
    await module.exports.default(loader)
  } catch (error) {
    await loader.remove("release", serviceReleaseRequest)
    throw error
  }
}
