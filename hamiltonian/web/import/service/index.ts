/**
 * Service Worker importer между startup loader и загружаемыми modules.
 * Его artifact загружается и запускается внутри Service Worker, после чего
 * importer включает Web RPC service в изменяемый internal-контур Hamiltonian.
 *
 * @packageDocumentation
 */

import type * as Loader from "../../startup/service/loader"
import {importModule, updateModules} from "./loader"
import {moduleByName, rpc} from "./storage"

/**
 * Формирует Service Worker-контур из internal и будущих Metafor modules.
 *
 * @param loader - Универсальные primitives неизменяемого startup.
 */
export default async function importService(loader: typeof Loader) {
  console.debug("[@import/service]", "сервис загрузки модулей запущен", {module: rpc.endpoint})
  await importModule(loader, rpc, {
    updateModules: async (names: string[]) => {
      console.debug("[@import/service:update]", "проверяем список модулей", {modules: names})
      const modules = names.map(moduleByName)
      if (modules.some((module) => module === null)) {
        console.debug("[@import/service:update]", "в списке есть неизвестный модуль", {
          modules: names,
        })
        throw new Error(`Неизвестные браузерные модули: ${names.join(", ")}`)
      }
      console.debug("[@import/service:update]", "модули найдены", {
        modules: names,
        targets: modules.map((module) => module && ({
          cache: module.cache,
          endpoint: module.endpoint,
        })),
      })
      await updateModules(loader, modules as NonNullable<typeof modules[number]>[])
      console.debug("[@import/service:update]", "модули заменены в кэше", {modules: names})
    },
    restartBrowser,
  })
}

/** Создаёт новую Service Worker incarnation и один раз навигирует каждый Window. */
async function restartBrowser() {
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
  } catch (error) {
    console.debug("[@import/service:restart]", "не удалось перезагрузить страницы", {
      windows: targets,
    }, error)
    throw error
  }
}
