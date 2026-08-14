/**
 * Точка входа единственного HTTP- и WebSocket-сервера Hamiltonian.
 *
 * Литеральный `routes` показывает всю внешнюю HTTP-границу и условия выбора
 * ответа. WebSocket callbacks показывают полный control protocol. Предметное
 * состояние остаётся в `server-runtime.ts`; этот модуль только проверяет
 * входные условия и передаёт допустимые события именованным функциям.
 *
 * @packageDocumentation
 */

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

export const server = Bun.serve<HamiltonianServerSocketData>({
  hostname,
  port,
  ...tls,
  development: false,
  routes: {
    /**
     * Загружает страницу с `hostEpoch` текущего запуска и
     * `browserSourceRevision`. Страница использует их, чтобы не смешивать
     * lifecycle разных запусков сервера и перезагружаться после изменения
     * клиентских исходников.
     *
     * При локальной GET-навигации в HTML встраивается token: локальный browser
     * подключается без ручного ввода, а внешний клиент не получает секрет.
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
     * Явный адрес того же документа для прямых ссылок и перезагрузки страницы.
     * Применяет ту же привязку к запуску сервера и то же правило локального
     * token, поэтому `/` и `/index.html` не создают разные варианты bootstrap.
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
     * Визуализирует наблюдаемое состояние Hamiltonian. Модуль подписывается на
     * lifecycle и описания систем нод, строит из них read-only граф, передаёт
     * расчёт геометрии в layout Worker и обновляет WebGPU-сцену.
     */
    "/orchestration.js": async () => await handleOrchestrationBundle(),

    /**
     * Рассчитывает расположение нод вне основного потока страницы. Worker
     * принимает снимок графа и возвращает только результат раскладки, поэтому
     * тяжёлый расчёт не задерживает ввод и отрисовку WebGPU-сцены.
     */
    "/layout-worker.js": async () => await handleLayoutWorkerBundle(),

    /**
     * Даёт странице единый сценарий включения Web Push: запросить разрешение,
     * восстановить подходящую `PushSubscription` или заменить подписку с другим
     * VAPID key и зарегистрировать результат через Service Worker.
     */
    "/web-push-client.js": async () => await handleWebPushClientBundle(),

    /**
     * Запускает общий для browser profile Service Worker. Он объединяет вкладки,
     * удерживает control WebSocket, проверяет и кеширует browser release,
     * принимает Web Push и восстанавливает связь после пробуждения.
     *
     * `Cache-Control: no-cache` заставляет browser перепроверять worker script,
     * иначе обновлённый Service Worker мог бы остаться незамеченным.
     */
    "/sw-entry.js": async () => await handleServiceWorkerBundle(),

    /**
     * Создаёт единственный server control channel для Service Worker. Через него
     * browser сообщает lifecycle и состав вкладок, получает release target и
     * обменивается WebRTC signalling.
     *
     * До upgrade token подтверждает право подключения, а `device`, `transport`
     * и `worker` связывают socket с конкретным browser profile и Service Worker.
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
     * Передаёт странице публичный VAPID key текущего Hamiltonian. Web Push
     * client привязывает к нему `PushSubscription`, чтобы push service мог
     * доставить подписанную сервером команду пробуждения. Сам key не является
     * секретом, но этот contour выдаёт его только уже авторизованной странице.
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
     * Проверяет полный сценарий Web Push wake: отправляет сообщение ранее
     * зарегистрированному Service Worker и ожидает новый control connection как
     * доказательство пробуждения. Повторный wake запрещён, пока прежняя попытка
     * не подтверждена или не завершилась по timeout.
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
     * Описывает release, которую должен подготовить Service Worker: versioned
     * module, его SHA-256 и целевую версию самого Service Worker. До исполнения
     * кода browser сверяет полученные bytes с этим manifest.
     */
    "/manifest.json": async (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return await handleManifest()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Показывает диагностике единый снимок server lifecycle, подключённых
     * browser profiles, выбранного лидера, Bun-процессов и WebRTC peer. Endpoint
     * ничего не изменяет, а Bearer gate не раскрывает operational topology
     * клиенту, который не присоединился к Hamiltonian.
     */
    "/lab/status": (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleStatus()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Содержит код воплощения текущей версии. Service Worker сначала сверяет
     * bytes с SHA-256 из manifest и только затем разрешает странице загрузить
     * модуль для `main` и Dedicated Worker.
     */
    [versionedModulePath]: (request: Request) => {
      if (isAuthorizedRequest(request)) {
        return handleVersionedModule()
      } else {
        return new Response("Unauthorized", {status: 401})
      }
    },

    /**
     * Сохраняет правильный порядок запуска страницы: сначала создаёт monitor,
     * затем параллельно загружает прикладной runtime и визуализацию. Благодаря
     * этому первые lifecycle messages не проходят раньше открытия канала.
     */
    "/window-entry.js": () => handleStaticAsset("/window-entry.js"),

    /**
     * Управляет жизненным циклом текущей страницы. Модуль подключает её к
     * Service Worker, создаёт `main` и Dedicated Worker из принятой release и
     * поддерживает прямые WebRTC-каналы Oracle и Force.
     */
    "/app.js": () => handleStaticAsset("/app.js"),

    /**
     * Принимает от страницы команду рождения, загружает указанный versioned
     * module и создаёт его воплощение внутри Dedicated Worker. Результат запуска
     * и lifecycle observations возвращаются странице через worker messages.
     */
    "/embodiment-worker.js": () => handleStaticAsset("/embodiment-worker.js"),

    /**
     * Создаёт monitor до запуска кода Dedicated Worker. Это фиксирует identity
     * нового Worker и открывает lifecycle channel раньше первого сообщения о
     * его рождении.
     */
    "/embodiment-worker-entry.js": () => handleStaticAsset("/embodiment-worker-entry.js"),

    /**
     * Растягивает WebGPU canvas на всё окно и запрещает browser обрабатывать
     * жесты поверх интерактивной сцены. Текстовый status скрыт при нормальной
     * работе и становится видимым, если визуализация не запустилась.
     */
    "/styles.css": () => handleStaticAsset("/styles.css"),

    /**
     * Фиксирует шрифт, которым WebGPU renderer измеряет и рисует текст нод.
     * Собственный TTF сохраняет одинаковую геометрию подписей независимо от
     * набора системных шрифтов на машине с browser.
     */
    "/engine-static/JetBrainsMono-Bold.ttf": () => handleStaticAsset("/engine-static/JetBrainsMono-Bold.ttf"),

    /**
     * Содержит общий механизм authority lease, fencing и поколений подключения.
     * Server формирует из него lease identity, Service Worker выбирает поколение
     * reconnect, а WebRTC peer упорядочивает Oracle и Force messages.
     */
    "/core/runtime.js": () => handleStaticAsset("/core/runtime.js"),

    /**
     * Управляет Cache Storage для versioned modules. Service Worker исполняет
     * модуль только после проверки SHA-256 и сохраняет текущий с предыдущим
     * cache, чтобы не потерять уже подтверждённую release при переходе.
     */
    "/core/cache.js": () => handleStaticAsset("/core/cache.js"),

    /**
     * Содержит проверки актуальности browser resources: heartbeat страницы,
     * замену Window после reload, текущий MessagePort, Worker и поколение peer.
     * Они не дают запоздавшему callback старого ресурса изменить новый runtime.
     */
    "/core/browser-control.js": () => handleStaticAsset("/core/browser-control.js"),

    /**
     * Последовательно применяет принятую release к странице. При смене
     * `browserSourceRevision` перезагружает документ; при смене versioned module
     * заменяет Dedicated Worker и перезагружает активный `main` только тогда,
     * когда старое воплощение уже исполняется в Window.
     */
    "/update/page-update.js": () => handleStaticAsset("/update/page-update.js"),

    /**
     * Первым создаёт identity текущего Window или Worker и открывает общий
     * lifecycle `BroadcastChannel`. До подключения consumers сохраняет не более
     * 512 ранних сообщений, поэтому параллельный bootstrap не теряет события.
     */
    "/core/monitor.js": () => handleStaticAsset("/core/monitor.js"),

    /**
     * Определяет единый формат наблюдений за entity, transport и messages.
     * Journal, cursor и validators позволяют server и browser realms объединять
     * причинный порядок, восстанавливать снимки, замечать gaps и отбрасывать
     * повторные события уже завершившегося источника.
     */
    "/core/lifecycle.js": () => handleStaticAsset("/core/lifecycle.js"),

    /**
     * Строит стабильные идентификаторы browser, Window и page для visual graph.
     * При выполнении действия проверяет allowlist и точного локального адресата,
     * чтобы команда из HUD не ушла другой вкладке или Service Worker.
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
