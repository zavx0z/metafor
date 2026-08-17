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
import {confirmRestart} from "./state"
import {updatePackages} from "./storage"

/**
 * Формирует изменяемый Service Worker-контур release.
 *
 * @param loader - Универсальные primitives неизменяемого startup.
 */
export default async function releaseService(loader: ReleaseLoader) {
  console.debug("[@release/service]", "Service Worker release запущен", {rpc: "/sw"})
  startRpc({
    confirmCurrent: confirmRestart,
    currentPackages: currentReleasePackages,
    updateModules: async (input: unknown) => {
      console.debug("[@release/service:update]", "проверяем состояние пакетов", {packages: input})
      const packages = updatePackages(input)
      if (packages === null) {
        console.debug("[@release/service:update]", "состояние пакетов не принято", {
          packages: input,
        })
        throw new Error("Некорректное состояние браузерных пакетов")
      }
      console.debug("[@release/service:update]", "состояние пакетов принято", {
        packages: packages.map((entry) => ({
          env: entry.env,
          name: entry.name,
          sha256: entry.sha256,
          size: entry.size,
          version: entry.version,
        })),
      })
      const updated = await updateRelease(loader, packages)
      console.debug("[@release/service:update]", "пакеты переключены в кэше", {packages: updated})
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
  console.debug("[@release/service:restart]", "начинаем перезагрузку страниц", {
    registration: registration.scope,
    windows: targets,
  })

  try {
    const unregistered = await registration.unregister()
    console.debug("[@release/service:restart]", "регистрация Service Worker удалена", {
      registration: registration.scope,
      unregistered,
    })
    if (!unregistered) throw new Error("Service Worker registration was not removed")

    console.debug("[@release/service:restart]", "начинаем повторную навигацию страниц", {
      windows: targets,
    })
    const navigations = await Promise.all(windows.map((client) => client.navigate(client.url)))
    console.debug("[@release/service:restart]", "повторная навигация страниц запущена", {
      navigated: navigations.filter((client) => client !== null).length,
      requested: windows.length,
    })
    await confirmRestart()
  } catch (error) {
    console.debug("[@release/service:restart]", "не удалось перезагрузить страницы", {
      windows: targets,
    }, error)
    throw error
  }
}
