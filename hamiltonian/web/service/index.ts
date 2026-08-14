/**
 * Event entrypoint неизменяемой Service Worker оболочки.
 *
 * Install и activate немедленно передают новой инкарнации управление. Первое
 * `connect` message продлевает жизнь события до подготовки bootstrap cache и
 * одновременно открывает control WebSocket. Все GET requests после захвата
 * страницы проходят через cache-first policy.
 *
 * @packageDocumentation
 */

import {cacheBootstrap, cacheFirst} from "./cache"
import {connect} from "./socket"

addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(skipWaiting())
})

addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clients.claim())
})

addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type !== "connect") return
  event.waitUntil(cacheBootstrap())
  connect()
})

addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return
  event.respondWith(cacheFirst(event.request))
})
