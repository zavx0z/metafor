/**
 * Сменяемый Service Worker release между startup bridge и browser packages.
 * Factory возвращает inert runtime; RPC и timers появляются только в start().
 *
 * @packageDocumentation
 */

import {createReleaseCache} from "../fetch"
import type {
  ReleaseDependencies,
  ReleaseLoader,
  ReleaseRuntime,
} from "./contract"
import {currentReleasePackages} from "../cache/current"
import {updateRelease} from "../update"
import {startRpc, type RpcRuntime} from "../rpc"

/** Создаёт release без постоянных side effects до явного start(). */
export default function releaseService(
  dependencies: ReleaseDependencies,
): ReleaseRuntime {
  const cache = createReleaseCache(dependencies.loader)
  const cleanups: Array<() => void | Promise<void>> = []
  let starting: Promise<void> | null = null
  let destroying: Promise<void> | null = null

  const start = async () => {
    if (destroying) throw new Error("Destroyed Service Worker release cannot start")
    starting ??= startRuntime()
    await starting
  }

  const startRuntime = async () => {
    const abort = new AbortController()
    cleanups.push(() => abort.abort())
    let rpc: RpcRuntime | null = null

    try {
      rpc = startRpc({
        currentPackages: currentReleasePackages,
        applyDelta: async (delta) => {
          console.debug("[@hamiltonian/release:service-worker:update]", "применяем fresh server delta", {
            remove: delta.remove,
            update: delta.update,
          })
          const updated = await updateRelease(dependencies.loader, delta, {
            prepare: dependencies.runtime.prepare,
            activate: dependencies.runtime.activate,
            signal: abort.signal,
          })
          console.debug("[@hamiltonian/release:service-worker:update]", "пакеты переключены в кэше", {
            packages: updated,
          })
          return updated
        },
        restartBrowser: navigateWindows,
      })
      cleanups.push(() => rpc?.destroy())
      await cache.cacheStartup()
      console.debug("[@hamiltonian/release:service-worker]", "Service Worker release запущен", {
        rpc: "/sw",
      })
    } catch (error) {
      await rpc?.destroy()
      throw error
    }
  }

  const destroy = async () => {
    destroying ??= (async () => {
      for (const cleanup of [...cleanups].reverse()) await cleanup()
      cleanups.length = 0
      console.debug("[@hamiltonian/release:service-worker]", "Service Worker release очищен")
    })()
    await destroying
  }

  return Object.freeze({
    start,
    async fetch(event: FetchEvent) {
      if (event.request.method !== "GET") return await fetch(event.request)
      return await cache.cacheFirst(event.request)
    },
    async message(_event: ExtendableMessageEvent) {},
    destroy,
  })
}

export type {
  ReleaseDependencies,
  ReleaseFactory,
  ReleaseLoader,
  ReleaseRuntime,
} from "./contract"

/** Навигирует каждый управляемый Window ровно один раз без удаления registration. */
async function navigateWindows() {
  const windows = await clients.matchAll({type: "window"})
  const targets = windows.map((client) => ({id: client.id, url: client.url}))
  console.debug("[@hamiltonian/release:service-worker:restart]", "начинаем перезагрузку страниц", {
    registration: registration.scope,
    windows: targets,
  })

  const navigations = await Promise.all(windows.map((client) => client.navigate(client.url)))
  console.debug("[@hamiltonian/release:service-worker:restart]", "повторная навигация страниц завершена", {
    navigated: navigations.filter((client) => client !== null).length,
    requested: windows.length,
  })
}
