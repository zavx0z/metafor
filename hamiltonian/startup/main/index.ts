/**
 * Main-thread entrypoint минимального browser loader.
 *
 * При первой установке модуль ждёт появления Service Worker controller, а при
 * уже controlled document использует текущий controller. Main просит Worker
 * запустить Service Worker release, затем запускает обновляемый Window release.
 *
 * @packageDocumentation
 */

const registration = await navigator.serviceWorker.register("/@hamiltonian/startup?env=service-worker", {
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

await import("@hamiltonian/release")
serviceWorker.postMessage({type: "connect"})
console.debug("[@hamiltonian/startup:main]", "страница готова к работе", {
  controller: serviceWorker.scriptURL,
  registration: registration.scope,
})
