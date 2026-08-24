/**
 * Main-thread entrypoint минимального browser loader.
 *
 * При первой установке модуль ждёт появления Service Worker controller, а при
 * уже controlled document использует текущий controller. Service Worker
 * release запускается самой startup-оболочкой, а Window запускает свой release.
 * Пользовательский lifecycle задан [startup owner law](../README.md#как-начинается-работа).
 *
 * @packageDocumentation
 */

const registration = await navigator.serviceWorker.register("/@cosmos/startup?env=service", {
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

await import("@cosmos/release")
console.debug("[@cosmos/startup:main]", "страница готова к работе", {
  controller: serviceWorker.scriptURL,
  registration: registration.scope,
})
