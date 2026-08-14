type HamiltonianHttpHandlerResult = Response | Promise<Response>
type HamiltonianControlHandlerResult = Response | undefined | Promise<Response | undefined>

export const HAMILTONIAN_HTTP_PATHS = Object.freeze({
  navigation: "/",
  navigationIndex: "/index.html",
  orchestrationBundle: "/orchestration.js",
  layoutWorkerBundle: "/layout-worker.js",
  webPushClientBundle: "/web-push-client.js",
  serviceWorkerBundle: "/sw-entry.js",
  control: "/control",
  vapidPublicKey: "/push/vapid-public-key",
  wakeServiceWorker: "/lab/wake-service-worker",
  manifest: "/manifest.json",
  status: "/lab/status",
})

export interface HamiltonianHttpRequestContext<TBunServer> {
  request: Request
  url: URL
  bunServer: TBunServer
}

export interface HamiltonianHttpHandlers<TBunServer> {
  version: string
  navigation(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  orchestrationBundle(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  layoutWorkerBundle(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  webPushClientBundle(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  serviceWorkerBundle(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  control(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianControlHandlerResult
  vapidPublicKey(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  wakeServiceWorker(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  manifest(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  status(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  versionedModule(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
  staticFallback(context: HamiltonianHttpRequestContext<TBunServer>): HamiltonianHttpHandlerResult
}

export function hamiltonianVersionedModulePath(version: string): string {
  return `/versions/${encodeURIComponent(version)}/module.js`
}

export async function routeHamiltonianHttpRequest<TBunServer>(
  request: Request,
  bunServer: TBunServer,
  handlers: HamiltonianHttpHandlers<TBunServer>,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const context = {request, url, bunServer}

  if (
    request.method === "GET" &&
    (url.pathname === HAMILTONIAN_HTTP_PATHS.navigation ||
      url.pathname === HAMILTONIAN_HTTP_PATHS.navigationIndex)
  ) {
    return await handlers.navigation(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.orchestrationBundle) {
    return await handlers.orchestrationBundle(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.layoutWorkerBundle) {
    return await handlers.layoutWorkerBundle(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.webPushClientBundle) {
    return await handlers.webPushClientBundle(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.serviceWorkerBundle) {
    return await handlers.serviceWorkerBundle(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.control) {
    return await handlers.control(context)
  }
  if (request.method === "GET" && url.pathname === HAMILTONIAN_HTTP_PATHS.vapidPublicKey) {
    return await handlers.vapidPublicKey(context)
  }
  if (request.method === "POST" && url.pathname === HAMILTONIAN_HTTP_PATHS.wakeServiceWorker) {
    return await handlers.wakeServiceWorker(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.manifest) {
    return await handlers.manifest(context)
  }
  if (url.pathname === HAMILTONIAN_HTTP_PATHS.status) {
    return await handlers.status(context)
  }
  if (url.pathname === hamiltonianVersionedModulePath(handlers.version)) {
    return await handlers.versionedModule(context)
  }
  return await handlers.staticFallback(context)
}
