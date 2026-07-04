import {describe, expect, test} from "bun:test"
import {interpreterRoutes} from "./routes.ts"

const {proxy} = interpreterRoutes

describe("interpreterRoutes.proxy", () => {
  test("publishes tools as the primary source editing API", () => {
    const publicRoutes = new Set(interpreterRoutes.index.map((route) => `${route.method} ${route.path}`))
    expect(publicRoutes.has("POST /processes/:id/tools")).toBe(true)
    expect(publicRoutes.has("GET /processes/:id/source?scriptId=<id>")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/source")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/apply_patch")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/action")).toBe(false)
  })

  test("maps app/web interpreter prefix to upstream paths", () => {
    expect(proxy.toUpstreamPath("/hud/interpreter/processes")).toBe("/processes")
    expect(proxy.toUpstreamPath("/hud/interpreter/processes/app-web/tools")).toBe("/processes/app-web/tools")
    expect(proxy.toUpstreamPath("/hud/interpreter/ws")).toBe("/ws")
    expect(proxy.toUpstreamPath("/hud/interpreter/webrtc/signaling")).toBe("/webrtc/signaling")
    expect(proxy.toUpstreamPath("/hud/interpreter")).toBe("/")
    expect(proxy.toUpstreamPath("/interp/webrtc/signaling")).toBe("/webrtc/signaling")
    expect(proxy.toUpstreamPath("/hud/interpreter/remote-desktop/rtc/state")).toBe("/remote-desktop/rtc/state")
    expect(proxy.toUpstreamPath("/interp/remote-desktop/rtc/state")).toBe("/remote-desktop/rtc/state")
    expect(proxy.toUpstreamPath("/hud/interpreter/remote-desktop/lifecycle")).toBe("/remote-desktop/lifecycle")
    expect(proxy.toUpstreamPath("/interp/remote-desktop/lifecycle")).toBe("/remote-desktop/lifecycle")
    expect(proxy.toUpstreamPath("/hud/interpreter/remote-desktop/snapshot")).toBe("/remote-desktop/snapshot")
    expect(proxy.toUpstreamPath("/interp/remote-desktop/snapshot")).toBe("/remote-desktop/snapshot")
    expect(proxy.toUpstreamPath("/hud/terminal")).toBeNull()
  })

  test("accepts process routes required by app/web live interpreter tools", () => {
    expect(proxy.acceptsPath("/")).toBe(true)
    expect(proxy.acceptsPath("/ws")).toBe(true)
    expect(proxy.acceptsPath("/context")).toBe(true)
    expect(proxy.acceptsPath("/events")).toBe(true)
    expect(proxy.acceptsPath("/console")).toBe(true)
    expect(proxy.acceptsPath("/client-event")).toBe(true)
    expect(proxy.acceptsPath("/webrtc/signaling")).toBe(true)
    expect(proxy.acceptsPath("/remote-desktop/lifecycle")).toBe(true)
    expect(proxy.acceptsPath("/remote-desktop/rtc/state")).toBe(true)
    expect(proxy.acceptsPath("/remote-desktop/snapshot")).toBe(true)
    expect(proxy.acceptsPath("/processes")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/modules")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/tools")).toBe(true)
  })

  test("blocks routes outside the app/web proxy surface", () => {
    expect(proxy.acceptsPath("/space")).toBe(false)
    expect(proxy.acceptsPath("/hud/terminal/stream")).toBe(false)
    expect(proxy.acceptsPath("/processes/app-web/action")).toBe(false)
    expect(proxy.acceptsPath("/processes/app-web/source")).toBe(false)
    expect(proxy.acceptsPath("/processes/app-web/apply_patch")).toBe(false)
    expect(proxy.acceptsPath("/processes/app-web/unknown")).toBe(false)
  })
})
