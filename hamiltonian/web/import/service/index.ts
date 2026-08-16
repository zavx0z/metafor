/**
 * Service Worker importer между startup loader и загружаемыми modules.
 * Его artifact загружается и запускается внутри Service Worker, после чего
 * importer включает Web RPC service в изменяемый internal-контур Hamiltonian.
 *
 * @packageDocumentation
 */

import type * as Loader from "../../startup/service/loader"
import {importModule, updateModules} from "./loader"
import {rpc, updatePackages} from "./storage"

/**
 * Формирует Service Worker-контур из internal и будущих Metafor modules.
 *
 * @param loader - Универсальные primitives неизменяемого startup.
 */
export default async function importService(loader: typeof Loader) {
  console.debug("[@import/service]", "сервис загрузки модулей запущен", {module: rpc.endpoint})
  await importModule(loader, rpc, {
    updateModules: async (input: unknown) => {
      console.debug("[@import/service:update]", "проверяем состояние пакетов", {packages: input})
      const packages = updatePackages(input)
      if (packages === null) {
        console.debug("[@import/service:update]", "состояние пакетов не принято", {
          packages: input,
        })
        throw new Error("Некорректное состояние браузерных пакетов")
      }
      console.debug("[@import/service:update]", "состояние пакетов принято", {
        packages: packages.map((entry) => ({
          cache: entry.cache,
          endpoint: entry.endpoint,
          name: entry.name,
          version: entry.version,
        })),
      })
      const updated = await updateModules(loader, packages)
      console.debug("[@import/service:update]", "пакеты переключены в кэше", {packages: updated})
      return updated
    },
    restartBrowser: () => restartBrowser(loader),
  })
}

/** Создаёт новую Service Worker incarnation и один раз навигирует каждый Window. */
async function restartBrowser(loader: typeof Loader) {
  const windows = await clients.matchAll({type: "window"})
  const targets = windows.map((client) => ({id: client.id, url: client.url}))
  console.debug("[@import/service:restart]", "начинаем перезагрузку страниц", {
    registration: registration.scope,
    windows: targets,
  })

  try {
    const unregistered = await registration.unregister()
    console.debug("[@import/service:restart]", "регистрация Service Worker удалена", {
      registration: registration.scope,
      unregistered,
    })
    if (!unregistered) throw new Error("Service Worker registration was not removed")

    console.debug("[@import/service:restart]", "начинаем повторную навигацию страниц", {
      windows: targets,
    })
    const navigations = await Promise.all(windows.map((client) => client.navigate(client.url)))
    console.debug("[@import/service:restart]", "повторная навигация страниц запущена", {
      navigated: navigations.filter((client) => client !== null).length,
      requested: windows.length,
    })
    await loader.confirmRestart()
  } catch (error) {
    console.debug("[@import/service:restart]", "не удалось перезагрузить страницы", {
      windows: targets,
    }, error)
    throw error
  }
}
