/**
 * Main-thread entrypoint минимального browser loader.
 *
 * При первой установке модуль ждёт появления Service Worker controller, а при
 * уже controlled document использует текущий controller. Main просит Worker
 * запустить Service Worker importer, затем запускает обновляемый Window
 * importer.
 *
 * @packageDocumentation
 */

const registration = await navigator.serviceWorker.register("/code?module=@startup/service", {
  scope: "/",
  type: "module",
})

await navigator.serviceWorker.ready

if (!navigator.serviceWorker.controller) {
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {once: true})
  })
}

const serviceWorker = navigator.serviceWorker.controller

if (!serviceWorker) throw new Error("Service Worker does not control the page")

serviceWorker.postMessage({type: "connect"})
await import("/code?module=@import/main")
console.info("startup/service registered", registration.scope)
