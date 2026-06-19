import {describe, expect, test} from "bun:test"
import {interpreterRoutes} from "./routes.ts"

const {proxy} = interpreterRoutes

describe("interpreterRoutes.proxy", () => {
  test("maps app/web interpreter prefix to upstream paths", () => {
    expect(proxy.toUpstreamPath("/hud/interpreter/processes")).toBe("/processes")
    expect(proxy.toUpstreamPath("/hud/interpreter/processes/app-web/source")).toBe("/processes/app-web/source")
    expect(proxy.toUpstreamPath("/hud/interpreter/processes/app-web/apply_patch")).toBe("/processes/app-web/apply_patch")
    expect(proxy.toUpstreamPath("/hud/interpreter")).toBe("/")
    expect(proxy.toUpstreamPath("/hud/terminal")).toBeNull()
  })

  test("accepts process routes required by app/web live interpreter tools", () => {
    expect(proxy.acceptsPath("/")).toBe(true)
    expect(proxy.acceptsPath("/context")).toBe(true)
    expect(proxy.acceptsPath("/events")).toBe(true)
    expect(proxy.acceptsPath("/console")).toBe(true)
    expect(proxy.acceptsPath("/processes")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/modules")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/source")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/apply_patch")).toBe(true)
    expect(proxy.acceptsPath("/processes/app-web/apply-patch")).toBe(true)
  })

  test("blocks routes outside the app/web proxy surface", () => {
    expect(proxy.acceptsPath("/space")).toBe(false)
    expect(proxy.acceptsPath("/ws")).toBe(false)
    expect(proxy.acceptsPath("/hud/terminal/stream")).toBe(false)
    expect(proxy.acceptsPath("/processes/app-web/unknown")).toBe(false)
  })
})
