/**
 * Main-thread entrypoint минимального browser loader.
 *
 * При первой установке модуль ждёт появления Service Worker controller, а при
 * уже controlled document использует текущий controller. Main сообщает только
 * о готовности открыть transport; состав startup cache принадлежит Worker.
 *
 * @packageDocumentation
 */

const registration = await navigator.serviceWorker.register("/service.js", {
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
await import("/main.js")
console.info("web/service registered", registration.scope)
