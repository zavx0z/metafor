import {networkInterfaces} from "node:os"
import {
  acceptControlMessageMonitor,
  applicationMessageAllowed,
  bindHamiltonianServer,
  bunReady,
  controlTokenMatches,
  handleBrowserLifecycleSnapshot,
  handleControlClose,
  handleControlDrain,
  handleControlOpen,
  handleIdentity,
  handleLayoutWorkerBundle,
  handleLifecycleRetirement,
  handleManifest,
  handleNavigation,
  handleOrchestrationBundle,
  handlePeerFailure,
  handlePeerSignal,
  handlePong,
  handlePushSubscription,
  handleServiceWorkerBundle,
  handleStaticAsset,
  handleStatus,
  handleTabs,
  handleVapidPublicKey,
  handleVersionedModule,
  handleWakeServiceWorker,
  handleWebPushClientBundle,
  hasPendingWake,
  hasPushSubscription,
  hostname,
  identity,
  isAuthorizedRequest,
  isRealtimePayloadOnControlChannel,
  nextControlSocketData,
  parseControlMessage,
  placement,
  port,
  pushSubscriptionDeviceId,
  readWakeWorkerIdentity,
  recordControlFrame,
  rejectInvalidControlMessage,
  rejectRealtimeControlPayload,
  stopHamiltonianRuntime,
  tls,
  token,
  version,
  versionedModulePath,
  wakeWorkerEntityId,
  type HamiltonianServerSocketData,
} from "./server-runtime.ts"

type HamiltonianBunServer = Bun.Server<HamiltonianServerSocketData>

/**
 * Единственный Bun server Hamiltonian. Routes и WebSocket callbacks ниже
 * являются полной картой входящих запросов; предметные действия выполняют
 * именованные функции server runtime.
 */
export const server = Bun.serve<HamiltonianServerSocketData>({
  hostname,
  port,
  ...tls,
  development: false,
  routes: {
    /** Возвращает navigation bootstrap для GET, для остальных методов — прямой HTML asset. */
    "/": async (request: Request, bunServer: HamiltonianBunServer) => {
      if (request.method === "GET") {
        const address = bunServer.requestIP(request)?.address
        const localJoinToken = isLoopbackAddress(address) ? token : ""
        return await handleNavigation(localJoinToken)
      } else {
        return handleStaticAsset("/")
      }
    },

    /** Возвращает тот же navigation bootstrap по явному имени index.html. */
    "/index.html": async (request: Request, bunServer: HamiltonianBunServer) => {
      if (request.method === "GET") {
        const address = bunServer.requestIP(request)?.address
        const localJoinToken = isLoopbackAddress(address) ? token : ""
        return await handleNavigation(localJoinToken)
      } else {
        return handleStaticAsset("/index.html")
      }
    },

    /** Отдаёт собранный browser orchestration bundle. */
    "/orchestration.js": async () => await handleOrchestrationBundle(),

    /** Отдаёт собранный layout Worker bundle. */
    "/layout-worker.js": async () => await handleLayoutWorkerBundle(),

    /** Отдаёт собранный browser Web Push client bundle. */
    "/web-push-client.js": async () => await handleWebPushClientBundle(),

    /** Отдаёт Service Worker bundle с его специальной cache policy. */
    "/sw-entry.js": async () => await handleServiceWorkerBundle(),

    /** Проверяет control identity query и выполняет WebSocket upgrade. */
    "/control": (request: Request, bunServer: HamiltonianBunServer) => {
      const url = new URL(request.url)
      const suppliedToken = url.searchParams.get("token") ?? ""
      const deviceId = url.searchParams.get("device") ?? ""
      const lifecycleTransportId = url.searchParams.get("transport") ?? ""
      const workerEntityId = url.searchParams.get("worker") ?? ""

      if (
        !controlTokenMatches(suppliedToken) ||
        deviceId.length === 0 || deviceId.length > 128 ||
        !lifecycleTransportId.startsWith("websocket:") || lifecycleTransportId.length > 512 ||
        !workerEntityId.startsWith("service-worker:") || workerEntityId.length > 512
      ) {
        return new Response("Unauthorized", {status: 401})
      } else if (bunServer.upgrade(request, {
        data: nextControlSocketData(deviceId, lifecycleTransportId, workerEntityId),
      })) {
        return undefined
      } else {
        return new Response("WebSocket upgrade required", {status: 426})
      }
    },

    /** Возвращает VAPID public key только Bearer-авторизованному GET-запросу. */
    "/push/vapid-public-key": {
      GET: (request: Request) => {
        if (isAuthorizedRequest(request)) {
          return handleVapidPublicKey()
        } else {
          return new Response("Unauthorized", {status: 401})
        }
      },
    },

    /** Выполняет Bearer-авторизованное лабораторное Push-пробуждение. */
    "/lab/wake-service-worker": {
      POST: async (request: Request) => {
        if (!isAuthorizedRequest(request)) {
          return new Response("Unauthorized", {status: 401})
        }

        let workerIdentity: string | null
        try {
          workerIdentity = await readWakeWorkerIdentity(request)
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 400})
        }

        const workerEntityId = wakeWorkerEntityId(workerIdentity)
        if (workerEntityId === null || !hasPushSubscription(workerEntityId)) {
          return new Response("PushSubscription not found", {status: 404})
        }

        const workerDeviceId = pushSubscriptionDeviceId(workerEntityId)
        if (workerDeviceId === null) {
          return new Response("PushSubscription device not found", {status: 404})
        } else if (hasPendingWake(workerEntityId)) {
          return new Response("A Web Push wake is already pending for this Service Worker", {status: 409})
        } else {
          return await handleWakeServiceWorker(workerEntityId, workerDeviceId)
        }
      },
    },

    /** Возвращает browser release manifest только после Bearer-авторизации. */
    "/manifest.json": async (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return await handleManifest()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /** Возвращает read-only operational status только после Bearer-авторизации. */
    "/lab/status": (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleStatus()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /** Отдаёт immutable browser module текущей версии после Bearer-авторизации. */
    [versionedModulePath]: (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleVersionedModule()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /** Отдаёт bootstrap раннего Window monitor. */
    "/window-entry.js": () => handleStaticAsset("/window-entry.js"),

    /** Отдаёт page runtime. */
    "/app.js": () => handleStaticAsset("/app.js"),

    /** Отдаёт Dedicated Worker runtime. */
    "/embodiment-worker.js": () => handleStaticAsset("/embodiment-worker.js"),

    /** Отдаёт Dedicated Worker entrypoint. */
    "/embodiment-worker-entry.js": () => handleStaticAsset("/embodiment-worker-entry.js"),

    /** Отдаёт Visual stylesheet. */
    "/styles.css": () => handleStaticAsset("/styles.css"),

    /** Отдаёт шрифт canvas renderer. */
    "/engine-static/JetBrainsMono-Bold.ttf": () => handleStaticAsset("/engine-static/JetBrainsMono-Bold.ttf"),

    /** Отдаёт cross-runtime identity helpers. */
    "/core/runtime.js": () => handleStaticAsset("/core/runtime.js"),

    /** Отдаёт browser release cache controller. */
    "/core/cache.js": () => handleStaticAsset("/core/cache.js"),

    /** Отдаёт browser control contract. */
    "/core/browser-control.js": () => handleStaticAsset("/core/browser-control.js"),

    /** Отдаёт page update adapter. */
    "/update/page-update.js": () => handleStaticAsset("/update/page-update.js"),

    /** Отдаёт realm monitor contract. */
    "/core/monitor.js": () => handleStaticAsset("/core/monitor.js"),

    /** Отдаёт lifecycle wire contract. */
    "/core/lifecycle.js": () => handleStaticAsset("/core/lifecycle.js"),

    /** Отдаёт orchestration wire contract. */
    "/core/orchestration.js": () => handleStaticAsset("/core/orchestration.js"),
  },
  fetch: () => new Response("Not found", {status: 404}),
  websocket: {
    open(socket) {
      handleControlOpen(socket)
    },

    async message(socket, rawMessage) {
      recordControlFrame(rawMessage)

      if (isRealtimePayloadOnControlChannel(rawMessage)) {
        rejectRealtimeControlPayload(socket)
        return
      }

      const message = parseControlMessage(rawMessage)
      if (message === null) {
        rejectInvalidControlMessage(socket)
        return
      } else if (!applicationMessageAllowed(socket, message)) {
        return
      } else if (!acceptControlMessageMonitor(socket, message)) {
        return
      }

      switch (message.kind) {
        case "lifecycle-retirement":
          handleLifecycleRetirement(socket, message)
          return
        case "browser-lifecycle-snapshot":
          handleBrowserLifecycleSnapshot(socket, message)
          return
        case "pong":
          handlePong(socket, message)
          return
        case "identity":
          await handleIdentity(socket, message)
          return
        case "push-subscription":
          await handlePushSubscription(socket, message)
          return
        case "peer-signal":
          handlePeerSignal(socket, message)
          return
        case "peer-failed":
          handlePeerFailure(socket, message)
          return
        case "tabs":
          handleTabs(socket, message)
          return
      }
    },

    close(socket, code, reason) {
      handleControlClose(socket, code, reason)
    },

    drain(socket) {
      handleControlDrain(socket)
    },
  },
})

bindHamiltonianServer(server)

const scheme = server.protocol ?? "http"
console.log(`Hamiltonian ${identity} · version ${version}`)
console.log(`One listener: ${scheme}://${server.hostname}:${server.port}`)
void bunReady.then((embodiments) => {
  for (const [role, embodiment] of Object.entries(embodiments)) {
    console.log(`Bun ${role}: ${embodiment.state} · pid ${embodiment.pid} · incarnation ${embodiment.incarnation}`)
  }
})
for (const address of advertisedHosts(server.hostname ?? "127.0.0.1")) {
  const joinUrl = isLoopbackHostname(address)
    ? `${scheme}://${address}:${server.port}/`
    : `${scheme}://${address}:${server.port}/?token=${encodeURIComponent(token)}`
  console.log(`Join: ${joinUrl}`)
}
if (scheme === "http" && !isLoopbackHostname(server.hostname ?? "127.0.0.1")) {
  console.warn("Remote browsers need trusted HTTPS before they can register the Service Worker.")
}

export function stopHamiltonianServer(): Promise<void> {
  return stopHamiltonianRuntime(server)
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  return address === "::1" || address === "0:0:0:0:0:0:0:1" ||
    address.startsWith("127.") || address.startsWith("::ffff:127.")
}

function advertisedHosts(configuredHostname: string): string[] {
  if (configuredHostname !== "0.0.0.0" && configuredHostname !== "::") return [configuredHostname]
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address)
  )
  return addresses.length > 0 ? addresses : ["127.0.0.1"]
}

function isLoopbackHostname(value: string): boolean {
  return value === "127.0.0.1" || value === "localhost" || value === "::1"
}
