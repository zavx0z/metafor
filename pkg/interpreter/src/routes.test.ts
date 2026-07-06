import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {interpreterRoutes} from "./routes.ts"
import {startHttpServer} from "./server.ts"

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

  test("does not expose legacy interpreter proxy aliases", () => {
    const publicPaths = new Set<string>(interpreterRoutes.index.map((route) => route.path))
    expect(publicPaths.has("/hud/interpreter/*")).toBe(false)
    expect(publicPaths.has("/interp/*")).toBe(false)
    expect("proxy" in interpreterRoutes).toBe(false)
  })

  test("todo.create through tools opens Plan and highlights the created item", async () => {
    const cwd = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "metafor-todo-tools-"))
    writeFileSync(join(dir, "TODO.md"), "# Plan\n", "utf8")
    process.chdir(dir)

    const server = startHttpServer(({
      host: "127.0.0.1",
      port: 0,
      modules: {
        list: () => [],
        snapshots: () => [],
        onEvent: () => {},
        get: () => undefined,
      },
      logger: {
        status: () => {},
        event: () => {},
        onEvent: () => {},
      },
      eventLogPath: join(dir, ".events.log"),
      consoleLogPath: join(dir, ".console.log"),
    }) as unknown as Parameters<typeof startHttpServer>[0])

    const commands: Array<{command: string; params: Record<string, unknown>}> = []
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    try {
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), {once: true})
        ws.addEventListener("error", () => reject(new Error("test websocket failed to open")), {once: true})
      })
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>
        if (message.type !== "ui-host-command") return
        const command = String(message.command)
        const params = (message.params ?? {}) as Record<string, unknown>
        commands.push({command, params})
        ws.send(JSON.stringify({
          type: "ui-host-result",
          requestId: message.requestId,
          ok: true,
          result: {ok: true, command, params},
        }))
      })

      const response = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({tool_uses: [{recipient_name: "todo.create", parameters: {text: "Visible task", marker: "0"}}]}),
      })
      const body = await response.json() as {results: Array<{result: {item: {id: string}; visibility: unknown}}>}
      const createdId = body.results[0]!.result.item.id

      expect(commands).toEqual([
        {command: "hud.todo.show", params: {}},
        {command: "hud.todo.highlight", params: {id: createdId}},
      ])
      expect(body.results[0]!.result.visibility).toEqual({
        show: {ok: true, command: "hud.todo.show", result: {ok: true, command: "hud.todo.show", params: {}}},
        highlight: {ok: true, command: "hud.todo.highlight", result: {ok: true, command: "hud.todo.highlight", params: {id: createdId}}},
      })
    } finally {
      ws.close()
      server.stop(true)
      process.chdir(cwd)
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
