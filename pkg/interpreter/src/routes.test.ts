import {describe, expect, test} from "bun:test"
import {interpreterRoutes} from "./routes.ts"

describe("interpreterRoutes", () => {
  test("publishes tools as the primary source editing API", () => {
    const publicRoutes = new Set(interpreterRoutes.index.map((route) => `${route.method} ${route.path}`))
    expect(publicRoutes.has("POST /tools")).toBe(true)
    expect(publicRoutes.has("GET /tools")).toBe(true)
    expect(publicRoutes.has("POST /reload")).toBe(false)
    expect(publicRoutes.has("POST /restart")).toBe(false)
    expect(publicRoutes.has("GET /context")).toBe(false)
    expect(publicRoutes.has("GET /space")).toBe(false)
    expect(publicRoutes.has("POST /space/focus")).toBe(false)
    expect(publicRoutes.has("POST /space/network/action")).toBe(false)
    expect(publicRoutes.has("GET /events?since=<iso>&limit=<n>")).toBe(false)
    expect(publicRoutes.has("GET /console?since=<iso>&limit=<n>")).toBe(false)
    expect(publicRoutes.has("GET /devtools/targets")).toBe(false)
    expect(publicRoutes.has("POST /devtools/reload")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/tools")).toBe(false)
    expect(publicRoutes.has("GET /processes/:id/modules?q=<text>&limit=<n>")).toBe(false)
    expect(publicRoutes.has("GET /processes/:id/breakpoints")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/breakpoint")).toBe(false)
    expect(publicRoutes.has("GET /processes/:id/source?scriptId=<id>")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/source")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/apply_patch")).toBe(false)
    expect(publicRoutes.has("POST /processes/:id/action")).toBe(false)
  })

  test("does not expose app/web interpreter proxy aliases", () => {
    const publicPaths = new Set<string>(interpreterRoutes.index.map((route) => route.path))
    expect(publicPaths.has("/hud/interpreter/*")).toBe(false)
    expect(publicPaths.has("/interp/*")).toBe(false)
    expect("proxy" in interpreterRoutes).toBe(false)
  })
})
