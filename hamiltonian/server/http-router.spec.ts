import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {
  HAMILTONIAN_HTTP_PATHS,
  hamiltonianVersionedModulePath,
  routeHamiltonianHttpRequest,
  type HamiltonianHttpHandlers,
} from "./http-router.ts"

type TestServer = {name: string}

function createHarness(
  overrides: Partial<HamiltonianHttpHandlers<TestServer>> = {},
): {calls: string[]; handlers: HamiltonianHttpHandlers<TestServer>; server: TestServer} {
  const calls: string[] = []
  const response = (name: string) => () => {
    calls.push(name)
    return new Response(name)
  }
  const handlers: HamiltonianHttpHandlers<TestServer> = {
    version: "v-test",
    navigation: response("navigation"),
    orchestrationBundle: response("orchestrationBundle"),
    layoutWorkerBundle: response("layoutWorkerBundle"),
    webPushClientBundle: response("webPushClientBundle"),
    serviceWorkerBundle: response("serviceWorkerBundle"),
    control: response("control"),
    vapidPublicKey: response("vapidPublicKey"),
    wakeServiceWorker: response("wakeServiceWorker"),
    manifest: response("manifest"),
    status: response("status"),
    versionedModule: response("versionedModule"),
    staticFallback: response("staticFallback"),
    ...overrides,
  }
  return {calls, handlers, server: {name: "test-server"}}
}

async function routedHandlerName(
  method: string,
  pathname: string,
  harness = createHarness(),
): Promise<{calls: string[]; name: string | undefined}> {
  const result = await routeHamiltonianHttpRequest(
    new Request(new URL(pathname, "http://hamiltonian.test"), {method}),
    harness.server,
    harness.handlers,
  )
  return {calls: harness.calls, name: result === undefined ? undefined : await result.text()}
}

describe("Hamiltonian HTTP router", () => {
  test("dispatches every registered path in its historical order", async () => {
    const cases = [
      ["GET", HAMILTONIAN_HTTP_PATHS.navigation, "navigation"],
      ["GET", HAMILTONIAN_HTTP_PATHS.navigationIndex, "navigation"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.orchestrationBundle, "orchestrationBundle"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.layoutWorkerBundle, "layoutWorkerBundle"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.webPushClientBundle, "webPushClientBundle"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.serviceWorkerBundle, "serviceWorkerBundle"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.control, "control"],
      ["GET", HAMILTONIAN_HTTP_PATHS.vapidPublicKey, "vapidPublicKey"],
      ["POST", HAMILTONIAN_HTTP_PATHS.wakeServiceWorker, "wakeServiceWorker"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.manifest, "manifest"],
      ["PATCH", HAMILTONIAN_HTTP_PATHS.status, "status"],
      ["PATCH", hamiltonianVersionedModulePath("v-test"), "versionedModule"],
    ] as const

    for (const [method, pathname, expected] of cases) {
      const routed = await routedHandlerName(method, pathname)
      expect(routed.name).toBe(expected)
      expect(routed.calls).toEqual([expected])
    }
  })

  test("preserves the three explicit method gates", async () => {
    for (const [method, pathname] of [
      ["POST", HAMILTONIAN_HTTP_PATHS.navigation],
      ["POST", HAMILTONIAN_HTTP_PATHS.navigationIndex],
      ["POST", HAMILTONIAN_HTTP_PATHS.vapidPublicKey],
      ["GET", HAMILTONIAN_HTTP_PATHS.wakeServiceWorker],
    ] as const) {
      const routed = await routedHandlerName(method, pathname)
      expect(routed.name).toBe("staticFallback")
      expect(routed.calls).toEqual(["staticFallback"])
    }
  })

  test("keeps static and unknown paths in the final fallback", async () => {
    for (const pathname of ["/app.js", "/unknown"]) {
      const routed = await routedHandlerName("DELETE", pathname)
      expect(routed.name).toBe("staticFallback")
      expect(routed.calls).toEqual(["staticFallback"])
    }
  })

  test("preserves undefined after a successful control upgrade", async () => {
    const harness = createHarness({
      control() {
        harness.calls.push("control")
        return undefined
      },
    })
    const routed = await routedHandlerName("GET", HAMILTONIAN_HTTP_PATHS.control, harness)
    expect(routed.name).toBeUndefined()
    expect(routed.calls).toEqual(["control"])
  })

  test("keeps route ownership out of host fetch", async () => {
    const hamiltonianRoot = fileURLToPath(new URL("..", import.meta.url))
    const hostSource = await Bun.file(`${hamiltonianRoot}/host.ts`).text()

    for (const route of Object.values(HAMILTONIAN_HTTP_PATHS).filter((route) => route !== "/")) {
      expect(hostSource).not.toContain(JSON.stringify(route))
    }
    expect(hostSource).not.toContain("url.pathname ===")
    expect(hostSource).not.toContain("request.method ===")
    expect(
      hostSource.match(/routeHamiltonianHttpRequest\(request,\s*bunServer,\s*httpHandlers\)/g),
    ).toHaveLength(1)
    expect(hostSource).toMatch(
      /fetch\(request,\s*bunServer\)\s*\{\s*return routeHamiltonianHttpRequest\(request,\s*bunServer,\s*httpHandlers\)\s*\}/,
    )
  })
})
