/**
 * Сменяемый Service Worker release между startup bridge и browser packages.
 * Factory возвращает inert runtime; RPC и timers появляются только в start().
 *
 * @packageDocumentation
 */

import {createReleaseCache} from "../fetch"
import type {
  ReleaseDependencies,
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
    if (destroying) throw new Error("Destroyed release service cannot start")
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
          return await updateRelease(dependencies.loader, delta, {
            prepare: dependencies.runtime.prepare,
            activate: dependencies.runtime.activate,
            signal: abort.signal,
          })
        },
        restartBrowser: navigateWindows,
      })
      cleanups.push(() => rpc?.destroy())
      await cache.cacheStartup()
      console.debug("[@cosmos/release:service]", "release service запущен", {
        rpc: "/sw",
      })
    } catch (error) {
      await rpc?.destroy()
      throw error
    }
  }

  const destroy = async () => {
    destroying ??= (async () => {
      const resources = cleanups.length
      for (const cleanup of [...cleanups].reverse()) await cleanup()
      cleanups.length = 0
      console.debug("[@cosmos/release:service]", "release service очищен", {
        resources,
      })
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
  console.debug("[@cosmos/release:service:restart]", "перезагрузка Window начата", {
    registration: registration.scope,
    windows: targets,
  })

  const navigations = await Promise.all(windows.map((client) => client.navigate(client.url)))
  console.debug("[@cosmos/release:service:restart]", "перезагрузка Window завершена", {
    navigated: navigations.filter((client) => client !== null).length,
    requested: windows.length,
  })
}
