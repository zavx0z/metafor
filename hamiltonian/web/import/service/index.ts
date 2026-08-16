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
  console.info("service importer", Object.keys(loader))
  await importModule(loader, rpc, {
    updateModules: async (names: string[]) => {
      const modules = names.map(moduleByName)
      if (modules.some((module) => module === null))
        throw new Error(`Unknown browser modules ${names.join(", ")}`)
      await updateModules(loader, modules as NonNullable<typeof modules[number]>[])
    },
    restartBrowser,
  })
}

/** Создаёт новую Service Worker incarnation и один раз навигирует каждый Window. */
async function restartBrowser() {
  const windows = await clients.matchAll({type: "window"})
  if (!await registration.unregister())
    throw new Error("Service Worker registration was not removed")
  await Promise.all(windows.map((client) => client.navigate(client.url)))
}
