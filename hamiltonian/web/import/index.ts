const registration = await navigator.serviceWorker.register("/service.js", {
  scope: "/",
  type: "module",
})

const serviceWorker = registration.installing ?? registration.waiting ?? registration.active

if (!serviceWorker) {
  throw new Error("Service Worker registration has no worker")
}

if (serviceWorker.state === "redundant") {
  throw new Error("Service Worker became redundant")
}

if (serviceWorker.state !== "activated") {
  await new Promise<void>((resolve, reject) => {
    serviceWorker.addEventListener("statechange", () => {
      if (serviceWorker.state === "activated") resolve()
      if (serviceWorker.state === "redundant") reject(new Error("Service Worker became redundant"))
    })
  })
}

serviceWorker.postMessage({ type: "connect" })
console.info("web/service registered", registration.scope)
