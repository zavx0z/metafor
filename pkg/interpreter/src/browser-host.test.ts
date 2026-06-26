import {afterEach, expect, test} from "bun:test"
import {handleBrowserHostRoute} from "./browser-host.ts"

const originalUrl = process.env.INTERPRETER_BROWSER_HOST_URL
const originalPort = process.env.INTERPRETER_BROWSER_HOST_PORT
const originalRemoteUrl = process.env.INTERPRETER_REMOTE_DESKTOP_HOST_URL
const originalRemotePort = process.env.INTERPRETER_REMOTE_DESKTOP_HOST_PORT

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.INTERPRETER_BROWSER_HOST_URL
  } else {
    process.env.INTERPRETER_BROWSER_HOST_URL = originalUrl
  }
  if (originalPort === undefined) {
    delete process.env.INTERPRETER_BROWSER_HOST_PORT
  } else {
    process.env.INTERPRETER_BROWSER_HOST_PORT = originalPort
  }
  if (originalRemoteUrl === undefined) {
    delete process.env.INTERPRETER_REMOTE_DESKTOP_HOST_URL
  } else {
    process.env.INTERPRETER_REMOTE_DESKTOP_HOST_URL = originalRemoteUrl
  }
  if (originalRemotePort === undefined) {
    delete process.env.INTERPRETER_REMOTE_DESKTOP_HOST_PORT
  } else {
    process.env.INTERPRETER_REMOTE_DESKTOP_HOST_PORT = originalRemotePort
  }
})

test("browser host bridge returns unavailable when not configured", async () => {
  delete process.env.INTERPRETER_BROWSER_HOST_URL
  delete process.env.INTERPRETER_BROWSER_HOST_PORT

  const res = await handleBrowserHostRoute(new Request("http://interpreter/browser-display/state"), "GET", "/browser-display/state")
  expect(res).not.toBeNull()
  expect(res?.status).toBe(503)
  const body = await res!.json()
  expect(body.browserHost.configured).toBe(false)
})

test("browser host bridge rejects non-loopback targets", async () => {
  process.env.INTERPRETER_BROWSER_HOST_URL = "http://192.168.1.20:32123"
  delete process.env.INTERPRETER_BROWSER_HOST_PORT

  const res = await handleBrowserHostRoute(new Request("http://interpreter/browser-display/state"), "GET", "/browser-display/state")
  expect(res).not.toBeNull()
  expect(res?.status).toBe(503)
  const body = await res!.json()
  expect(String(body.error)).toContain("localhost")
})

test("browser host bridge proxies explicit routes to local host", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/state") {
        return Response.json({ok: true, path: url.pathname, search: url.search})
      }
      return new Response("not found", {status: 404})
    },
  })
  try {
    process.env.INTERPRETER_BROWSER_HOST_URL = `http://127.0.0.1:${server.port}`
    delete process.env.INTERPRETER_BROWSER_HOST_PORT

    const res = await handleBrowserHostRoute(new Request("http://interpreter/browser-display/state?x=1"), "GET", "/browser-display/state")
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ok: true, path: "/state", search: "?x=1"})
  } finally {
    await server.stop()
  }
})

test("browser host bridge maps status alias to upstream state", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      return Response.json({ok: true, path: url.pathname})
    },
  })
  try {
    process.env.INTERPRETER_BROWSER_HOST_PORT = String(server.port)
    delete process.env.INTERPRETER_BROWSER_HOST_URL

    const res = await handleBrowserHostRoute(new Request("http://interpreter/browser-display/status"), "GET", "/browser-display/status")
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ok: true, path: "/state"})
  } finally {
    await server.stop()
  }
})

test("remote desktop bridge proxies health to desktop host", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      return Response.json({ok: true, path: url.pathname})
    },
  })
  try {
    process.env.INTERPRETER_REMOTE_DESKTOP_HOST_PORT = String(server.port)
    delete process.env.INTERPRETER_REMOTE_DESKTOP_HOST_URL
    delete process.env.INTERPRETER_BROWSER_HOST_URL
    delete process.env.INTERPRETER_BROWSER_HOST_PORT

    const res = await handleBrowserHostRoute(new Request("http://interpreter/remote-desktop/health"), "GET", "/remote-desktop/health")
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ok: true, path: "/desktop/health"})
  } finally {
    await server.stop()
  }
})

test("remote desktop bridge exposes rtc state route", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      return Response.json({ok: true, path: url.pathname})
    },
  })
  try {
    process.env.INTERPRETER_REMOTE_DESKTOP_HOST_PORT = String(server.port)
    delete process.env.INTERPRETER_REMOTE_DESKTOP_HOST_URL

    const res = await handleBrowserHostRoute(new Request("http://interpreter/remote-desktop/rtc/state"), "GET", "/remote-desktop/rtc/state")
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ok: true, path: "/desktop/rtc/state"})
  } finally {
    await server.stop()
  }
})

test("browser host bridge rejects unsafe proxy paths", async () => {
  process.env.INTERPRETER_BROWSER_HOST_PORT = "32123"
  delete process.env.INTERPRETER_BROWSER_HOST_URL

  const res = await handleBrowserHostRoute(
    new Request("http://interpreter/browser-display/proxy/../state"),
    "GET",
    "/browser-display/proxy/../state",
  )
  expect(res).not.toBeNull()
  expect(res?.status).toBe(400)
})
