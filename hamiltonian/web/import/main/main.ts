/**
 * Window importer, загружаемый через Service Worker cache.
 *
 * @packageDocumentation
 */

import type * as Loader from "../../startup/main/loader"

/**
 * Формирует Window-контур из internal и будущих Metafor modules.
 *
 * @param loader - Неизменяемый API импорта Window modules.
 */
export default async function importMain(loader: typeof Loader) {
  console.info("main importer", Object.keys(loader))
}
