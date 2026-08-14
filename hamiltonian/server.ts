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
    /**
     * Создаёт page realm с identity/epoch сервера и revision browser source.
     * Local join token встраивается только в loopback GET; остальные методы
     * получают исходный документ без локального credential.
     */
    "/": async (request: Request, bunServer: HamiltonianBunServer) => {
      if (request.method === "GET") {
        const address = bunServer.requestIP(request)?.address
        const localJoinToken = isLoopbackAddress(address) ? token : ""
        return await handleNavigation(localJoinToken)
      } else {
        return handleStaticAsset("/")
      }
    },

    /**
     * Сохраняет тот же bootstrap и loopback policy для явной навигации на
     * `index.html`, чтобы прямой URL не создавал другой page runtime.
     */
    "/index.html": async (request: Request, bunServer: HamiltonianBunServer) => {
      if (request.method === "GET") {
        const address = bunServer.requestIP(request)?.address
        const localJoinToken = isLoopbackAddress(address) ? token : ""
        return await handleNavigation(localJoinToken)
      } else {
        return handleStaticAsset("/index.html")
      }
    },

    /**
     * Превращает lifecycle и node-system declarations в read-only граф,
     * размещает его через layout Worker и ведёт WebGPU HUD текущей страницы.
     */
    "/orchestration.js": async () => await handleOrchestrationBundle(),

    /**
     * Выносит расчёт геометрии node-system из page realm, чтобы перестроение
     * topology не блокировало ввод и отрисовку WebGPU HUD.
     */
    "/layout-worker.js": async () => await handleLayoutWorkerBundle(),

    /**
     * Согласует permission, PushSubscription и её регистрацию на server,
     * позволяя разбудить тот же Service Worker после остановки browser runtime.
     */
    "/web-push-client.js": async () => await handleWebPushClientBundle(),

    /**
     * Запускает владельца browser-profile control: Service Worker связывает
     * вкладки с server, удерживает verified release и принимает Web Push wake.
     * Специальная cache policy не позволяет browser скрыть новую worker release.
     */
    "/sw-entry.js": async () => await handleServiceWorkerBundle(),

    /**
     * Подключает Service Worker к server control plane для lifecycle, topology,
     * release и WebRTC signalling. До upgrade проверяются token и полная
     * browser-profile identity, чтобы socket нельзя было присвоить чужому realm.
     */
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

    /**
     * Даёт авторизованной page application server key, с которым browser
     * создаёт PushSubscription, принимаемую Hamiltonian для последующего wake.
     */
    "/push/vapid-public-key": {
      GET: (request: Request) => {
        if (isAuthorizedRequest(request)) {
          return handleVapidPublicKey()
        } else {
          return new Response("Unauthorized", {status: 401})
        }
      },
    },

    /**
     * Проверяет лабораторный сценарий пробуждения конкретного Service Worker:
     * допускает только известную subscription и не создаёт второй wake, пока
     * первый ожидает подтверждения новой control generation.
     */
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

    /**
     * Связывает ожидаемую browser version с immutable module URL и SHA-256;
     * Service Worker использует этот авторизованный договор до помещения release
     * в Cache Storage и до её исполнения.
     */
    "/manifest.json": async (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return await handleManifest()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Даёт лабораторной диагностике read-only снимок server, control, process,
     * peer и lifecycle без возможности изменить состояние singleton runtime.
     */
    "/lab/status": (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleStatus()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Предоставляет исполняемое воплощение текущей release только после
     * авторизации; его bytes проверяются Service Worker по manifest SHA-256 до
     * рождения main и Dedicated Worker embodiments.
     */
    [versionedModulePath]: (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleVersionedModule()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Загружает realm monitor раньше page runtime и visual orchestration, чтобы
     * incarnation и первые lifecycle observations существовали до подписчиков.
     */
    "/window-entry.js": () => handleStaticAsset("/window-entry.js"),

    /**
     * Ведёт воплощение текущей страницы: связывает Window с Service Worker и
     * Dedicated Worker, применяет release и поднимает direct Oracle/Force peer.
     */
    "/app.js": () => handleStaticAsset("/app.js"),

    /**
     * Исполняет подтверждённый versioned module в отдельном Dedicated Worker и
     * сообщает page realm о рождении, состоянии и завершении его embodiment.
     */
    "/embodiment-worker.js": () => handleStaticAsset("/embodiment-worker.js"),

    /**
     * Устанавливает realm monitor до Dedicated Worker runtime, чтобы его
     * incarnation и ранние lifecycle events не потерялись при bootstrap.
     */
    "/embodiment-worker-entry.js": () => handleStaticAsset("/embodiment-worker-entry.js"),

    /**
     * Закрепляет canvas как единственную полноэкранную visual surface, отключает
     * browser gestures над ней и раскрывает доступный status при отказе WebGPU.
     */
    "/styles.css": () => handleStaticAsset("/styles.css"),

    /**
     * Даёт canvas renderer встроенный моноширинный шрифт для подписей и метрик
     * нод, не зависящий от наличия системного font asset в browser profile.
     */
    "/engine-static/JetBrainsMono-Bold.ttf": () => handleStaticAsset("/engine-static/JetBrainsMono-Bold.ttf"),

    /**
     * Задаёт общие для server и browser правила lease/fencing, reconnect
     * generations и раздельных Oracle/Force sessions, отсекая stale authority.
     */
    "/core/runtime.js": () => handleStaticAsset("/core/runtime.js"),

    /**
     * Проверяет versioned module по manifest SHA-256 и удерживает current с
     * предыдущей release, чтобы Service Worker исполнял только проверенный код.
     */
    "/core/cache.js": () => handleStaticAsset("/core/cache.js"),

    /**
     * Защищает ownership page, Service Worker, worker channel и peer generation,
     * чтобы поздний callback заменённой incarnation не управлял текущим contour.
     */
    "/core/browser-control.js": () => handleStaticAsset("/core/browser-control.js"),

    /**
     * Сериализует переход page realm на проверенную release: перерождает
     * Dedicated Worker и перезагружает active main только при его замене.
     */
    "/update/page-update.js": () => handleStaticAsset("/update/page-update.js"),

    /**
     * Создаёт identity каждого browser realm и заранее открывает lifecycle
     * BroadcastChannel с bounded backlog до загрузки типизированных consumers.
     */
    "/core/monitor.js": () => handleStaticAsset("/core/monitor.js"),

    /**
     * Даёт всем realm одну causal-модель entity, transport и message
     * observations, retained snapshots и node-system declarations.
     */
    "/core/lifecycle.js": () => handleStaticAsset("/core/lifecycle.js"),

    /**
     * Нормализует browser/page node identity и разрешает visual HUD направлять
     * allowlisted действие только точному локальному Window или Service Worker.
     */
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
