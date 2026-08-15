/**
 * Event entrypoint неизменяемой Service Worker оболочки `@startup/service`.
 *
 * Install и activate немедленно передают новой инкарнации управление. Первое
 * `connect` message продлевает жизнь события до подготовки startup cache,
 * загрузки Service Worker importer и одновременно открывает control WebSocket.
 * Все GET requests после захвата страницы проходят через cache-first policy.
 *
 * @packageDocumentation
 */

import {cacheFirst, cacheStartup} from "./cache"
import {loadServiceImporter} from "./loader"
import {connect} from "./socket"

addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(skipWaiting())
})

addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clients.claim())
})

addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type !== "connect") return
  event.waitUntil(Promise.all([cacheStartup(), loadServiceImporter()]))
  connect()
})

addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return
  event.respondWith(cacheFirst(event.request))
})
