/**
 * Service Worker importer entrypoint между startup loader и runtime packages.
 * Его IIFE artifact загружается и запускается внутри Service Worker.
 *
 * @packageDocumentation
 */

console.info("service importer", Object.keys(loader))
