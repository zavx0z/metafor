/**
 * Event entrypoint неизменяемой Service Worker оболочки `@startup/service`.
 *
 * Install и activate немедленно передают новой инкарнации управление. Первое
 * `connect` message продлевает жизнь события до подготовки startup cache,
 * получает и запускает Service Worker importer через универсальный loader API
 * и ждёт подготовленные им modules. Все GET requests после захвата
 * страницы проходят через cache-first policy.
 *
 * @packageDocumentation
 */

import {cacheFirst, cacheStartup} from "./cache"
import * as loader from "./loader"

const serviceImporterRequest = new Request(new URL("/import-service.js", location.origin))

let serviceImporter: Promise<void> | null = null

addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(skipWaiting())
})

addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clients.claim())
})

addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type !== "connect") return
  event.waitUntil(Promise.all([cacheStartup(), loadServiceImporter()]))
})

addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return
  event.respondWith(cacheFirst(event.request))
})

/**
 * Загружает и один раз за инкарнацию запускает Service Worker importer.
 *
 * Одновременные события используют один Promise. После ошибки ссылка
 * освобождается, поэтому следующее событие может повторить полную загрузку.
 */
async function loadServiceImporter() {
  serviceImporter ??= startServiceImporter()

  try {
    await serviceImporter
  } catch (error) {
    serviceImporter = null
    throw error
  }
}

/** Получает importer, сохраняет его bytes и передаёт ему универсальный API. */
async function startServiceImporter() {
  try {
    let response = await loader.read("import", serviceImporterRequest)

    if (!response) {
      response = loader.verify(await fetch(serviceImporterRequest))
      await loader.cache("import", serviceImporterRequest, response)
      response = await loader.read("import", serviceImporterRequest)
    }

    if (!response) throw new Error("Cached Service Worker importer is missing")

    loader.verify(response)
    const module = {exports: {}} as {
      exports: {default: (loaderApi: typeof loader) => Promise<void>}
    }
    loader.run(await response.text(), {module})
    await module.exports.default(loader)
  } catch (error) {
    await loader.remove("import", serviceImporterRequest)
    throw error
  }
}
