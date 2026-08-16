/**
 * Service Worker importer между startup loader и загружаемыми modules.
 * Его artifact загружается и запускается внутри Service Worker, после чего
 * importer включает Web RPC service в изменяемый internal-контур Hamiltonian.
 *
 * @packageDocumentation
 */

import type * as Loader from "../../startup/service/loader"
import {importModule, updateModule} from "./loader"
import {moduleByName, rpc} from "./storage"

/**
 * Формирует Service Worker-контур из internal и будущих Metafor modules.
 *
 * @param loader - Универсальные primitives неизменяемого startup.
 */
export default async function importService(loader: typeof Loader) {
  console.info("service importer", Object.keys(loader))
  await importModule(loader, rpc, {
    updateModule: async (name: string) => {
      const module = moduleByName(name)
      if (module === null) throw new Error(`Unknown browser module ${name}`)
      await updateModule(loader, module)
    },
  })
}
