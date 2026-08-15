/**
 * Service Worker importer entrypoint между startup loader и runtime packages.
 * Его IIFE artifact загружается и запускается внутри Service Worker.
 *
 * @packageDocumentation
 */

if (
  typeof load.fetch !== "function"
  || typeof load.verify !== "function"
  || typeof load.cache !== "function"
  || typeof load.read !== "function"
  || typeof load.remove !== "function"
  || typeof load.run !== "function"
) throw new Error("Startup load API is missing")

console.info("service importer")
