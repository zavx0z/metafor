/**
 * Единый Bun REST/HTTP routes table Hamiltonian. Он документирует публичную
 * границу, а предметные state и effects оставляет именованным owner ports.
 *
 * @packageDocumentation
 */
import type {HamiltonianBrowserPublication, HamiltonianBrowserStaticAsset} from "./browser/publication.ts"
import {hamiltonianSecurityHeaders} from "./browser/publication.ts"
import type {HamiltonianBrowserRelease} from "./browser/release.ts"
import type {HamiltonianServerWebPush} from "./web-push/coordinator.ts"
import type {HamiltonianControlSocketData} from "./control/endpoint.ts"
import {safeEqual} from "./authentication.ts"

export interface HamiltonianControlUpgradePort {
  upgrade(
    request: Request,
    url: URL,
    server: Bun.Server<HamiltonianControlSocketData>,
  ): Response | undefined
}

export interface HamiltonianStatusReadPort {
  response(): Response
}

type HamiltonianRouteTable = Bun.Serve.RoutesWithUpgrade<HamiltonianControlSocketData, string>

/**
 * Полная HTTP-граница Hamiltonian. Таблица объявляет публичные пути и методы,
 * а каждую предметную операцию передаёт её именованному owner port.
 */
export class HamiltonianRoutes {
  readonly table: HamiltonianRouteTable

  constructor(
    publication: HamiltonianBrowserPublication,
    release: HamiltonianBrowserRelease,
    webPush: HamiltonianServerWebPush,
    control: HamiltonianControlUpgradePort,
    status: HamiltonianStatusReadPort,
    token: string,
  ) {
    const staticRoute = (asset: HamiltonianBrowserStaticAsset) => () => publication.staticAsset(asset)
    this.table = {
      /**
       * Отдаёт локальному браузеру динамический bootstrap без Bearer-авторизации;
       * чтение не меняет состояние сервера, исходником навигации владеет browser publication.
       */
      "/": async (request, server) => request.method === "GET"
        ? await publication.navigation(isLoopbackAddress(server.requestIP(request)?.address) ? token : "")
        : publication.staticAsset("index"),

      /**
       * Отдаёт явный HTML-псевдоним с той же политикой локального токена;
       * чтение не меняет состояние, identity навигации и ревизией исходников владеет browser publication.
       */
      "/index.html": async (request, server) => request.method === "GET"
        ? await publication.navigation(isLoopbackAddress(server.requestIP(request)?.address) ? token : "")
        : publication.staticAsset("index"),

      /**
       * Публикует собранную браузерную оркестрацию без авторизации и не меняет состояние;
       * кэшем и ошибками сборки владеет browser publication.
       */
      "/orchestration.js": async () => await bundleResponse(() => publication.orchestrationBundle()),

      /**
       * Публикует изолированный layout Worker без авторизации и не меняет состояние;
       * артефактом и его кэшем сборки владеет browser publication.
       */
      "/layout-worker.js": async () => await bundleResponse(() => publication.layoutWorkerBundle()),

      /**
       * Публикует браузерный Web Push adapter без авторизации и не меняет состояние сервера;
       * сборкой артефакта владеет browser publication, а не владелец Web Push subscription.
       */
      "/web-push-client.js": async () => await bundleResponse(() => publication.webPushClientBundle()),

      /**
       * Публикует исполняемый Service Worker без авторизации и не меняет состояние сервера;
       * исходными байтами и HTTP-политикой no-cache владеет browser publication.
       */
      "/sw-entry.js": async () => {
        try {
          const headers = new Headers(hamiltonianSecurityHeaders("text/javascript; charset=utf-8"))
          headers.set("content-security-policy", CONTENT_SECURITY_POLICY)
          headers.set("service-worker-allowed", "/")
          headers.set("cache-control", "no-cache")
          return new Response(await publication.serviceWorkerBundle(), {headers})
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 500})
        }
      },

      /**
       * Открывает control transport только после проверки токена и query-параметров;
       * поколением соединения и socket data владеет control endpoint.
       */
      "/control": (request, server) => control.upgrade(request, new URL(request.url), server),

      /**
       * Возвращает VAPID public key только Bearer-авторизованному оператору;
       * чтение не меняет состояние подписок, ключом владеет механизм Web Push.
       */
      "/push/vapid-public-key": {
        GET: (request) => authorized(request, token)
          ? Response.json({publicKey: webPush.publicKey}, {
            headers: hamiltonianSecurityHeaders("application/json; charset=utf-8"),
          })
          : new Response("Unauthorized", {status: 401}),
      },

      /**
       * Авторизованное лабораторное пробуждение создаёт ожидание, таймер и Push-доставку;
       * всей изменяемой операцией владеет механизм Web Push.
       */
      "/lab/wake-service-worker": {
        POST: async (request) => authorized(request, token)
          ? await webPush.handleWakeRequest(request)
          : new Response("Unauthorized", {status: 401}),
      },

      /**
       * Возвращает авторизованный манифест браузерного release, не меняя admission;
       * identity и целевой Service Worker вычисляет владелец browser release.
       */
      "/manifest.json": async (request) => authorized(request, token)
        ? await release.manifest()
        : new Response("Unauthorized", {status: 401}),

      /**
       * Даёт авторизованную проекцию состояния сервера только для чтения и не меняет его;
       * сборкой снимков и счётчиков владеет observation/status projection.
       */
      "/lab/status": (request) => authorized(request, token)
        ? status.response()
        : new Response("Unauthorized", {status: 401}),

      /**
       * Публикует только текущий авторизованный неизменяемый модуль версии;
       * исходником и SHA-256 владеет механизм browser release.
       */
      [release.modulePath]: (request) => authorized(request, token)
        ? release.versionedModule()
        : new Response("Unauthorized", {status: 401}),

      /**
       * Публикует прямой bootstrap раннего Window monitor без авторизации и изменения состояния;
       * файлом и CSP владеет browser publication.
       */
      "/window-entry.js": staticRoute("windowEntry"),

      /**
       * Публикует page runtime без авторизации и не меняет состояние сервера;
       * исходником владеет browser publication.
       */
      "/app.js": staticRoute("application"),

      /**
       * Публикует runtime Dedicated Worker без авторизации и не создаёт процесс на сервере;
       * исходником владеет browser publication.
       */
      "/embodiment-worker.js": staticRoute("embodimentWorker"),

      /**
       * Публикует entry Dedicated Worker без авторизации и не меняет состояние сервера;
       * исходником bootstrap владеет browser publication.
       */
      "/embodiment-worker-entry.js": staticRoute("embodimentWorkerEntry"),

      /**
       * Публикует таблицу стилей Visual без авторизации и изменения runtime;
       * политикой прямого ассета владеет browser publication.
       */
      "/styles.css": staticRoute("styles"),

      /**
       * Публикует шрифт canvas без авторизации и изменения состояния;
       * бинарным прямым ассетом владеет browser publication.
       */
      "/engine-static/JetBrainsMono-Bold.ttf": staticRoute("font"),

      /**
       * Публикует cross-runtime identity helpers без авторизации и изменения состояния;
       * прямым исходником владеет browser publication.
       */
      "/core/runtime.js": staticRoute("runtime"),

      /**
       * Публикует browser release-cache controller без авторизации и изменения сервера;
       * прямым исходником владеет browser publication, а состоянием release — Service Worker.
       */
      "/core/cache.js": staticRoute("releaseCache"),

      /**
       * Публикует browser control contract без авторизации и изменения состояния сервера;
       * прямым исходником владеет browser publication.
       */
      "/core/browser-control.js": staticRoute("browserControl"),

      /**
       * Публикует page update adapter без авторизации и не применяет обновление на сервере;
       * прямым исходником владеет browser publication.
       */
      "/update/page-update.js": staticRoute("pageUpdate"),

      /**
       * Публикует realm monitor contract без авторизации и изменения состояния сервера;
       * прямым исходником владеет browser publication.
       */
      "/core/monitor.js": staticRoute("monitor"),

      /**
       * Публикует lifecycle wire contract без авторизации и не меняет журнал;
       * прямым cross-runtime исходником владеет browser publication.
       */
      "/core/lifecycle.js": staticRoute("lifecycle"),

      /**
       * Публикует orchestration contract без авторизации и не меняет topology;
       * прямым cross-runtime исходником владеет browser publication.
       */
      "/core/orchestration.js": staticRoute("orchestrationContract"),
    }
  }
}

export function hamiltonianRouteFallback(): Response {
  return new Response("Not found", {status: 404})
}

function authorized(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization")
  return authorization?.startsWith("Bearer ") === true && safeEqual(authorization.slice(7), expectedToken)
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  return address === "::1" || address === "0:0:0:0:0:0:0:1" ||
    address.startsWith("127.") || address.startsWith("::ffff:127.")
}

async function bundleResponse(load: () => Promise<string>): Promise<Response> {
  try {
    return new Response(await load(), {headers: hamiltonianSecurityHeaders("text/javascript; charset=utf-8")})
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {status: 500})
  }
}

const CONTENT_SECURITY_POLICY = "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'"
