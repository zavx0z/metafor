/**
 * Сменяемый Service Worker release между startup loader и browser packages.
 * Его artifact загружается и запускается внутри Service Worker и сам владеет
 * RPC transport обновлений.
 *
 * @packageDocumentation
 */

import type {ReleaseLoader} from "./contract"
import {currentReleasePackages} from "./current"
import {updateRelease} from "./loader"
import {startRpc} from "./rpc"

/**
 * Формирует изменяемый Service Worker-контур release.
 *
 * @param loader - Универсальные primitives неизменяемого startup.
 */
export default async function releaseService(loader: ReleaseLoader) {
  console.debug("[@hamiltonian/release:service-worker]", "Service Worker release запущен", {rpc: "/sw"})
  startRpc({
    currentPackages: currentReleasePackages,
    applyDelta: async (delta) => {
      console.debug("[@hamiltonian/release:service-worker:update]", "применяем fresh server delta", {
        remove: delta.remove,
        update: delta.update,
      })
      const updated = await updateRelease(loader, delta)
      console.debug("[@hamiltonian/release:service-worker:update]", "пакеты переключены в кэше", {packages: updated})
      return updated
    },
    restartBrowser,
  })
}

export type {ReleaseLoader} from "./contract"

/** Создаёт новую Service Worker incarnation и один раз навигирует каждый Window. */
async function restartBrowser() {
  const windows = await clients.matchAll({type: "window"})
  const targets = windows.map((client) => ({id: client.id, url: client.url}))
  console.debug("[@hamiltonian/release:service-worker:restart]", "начинаем перезагрузку страниц", {
    registration: registration.scope,
    windows: targets,
  })

  try {
    const unregistered = await registration.unregister()
    console.debug("[@hamiltonian/release:service-worker:restart]", "регистрация Service Worker удалена", {
      registration: registration.scope,
      unregistered,
    })
    if (!unregistered) throw new Error("Service Worker registration was not removed")

    console.debug("[@hamiltonian/release:service-worker:restart]", "начинаем повторную навигацию страниц", {
      windows: targets,
    })
    const navigations = await Promise.all(windows.map((client) => client.navigate(client.url)))
    console.debug("[@hamiltonian/release:service-worker:restart]", "повторная навигация страниц запущена", {
      navigated: navigations.filter((client) => client !== null).length,
      requested: windows.length,
    })
  } catch (error) {
    console.debug("[@hamiltonian/release:service-worker:restart]", "не удалось перезагрузить страницы", {
      windows: targets,
    }, error)
    throw error
  }
}
