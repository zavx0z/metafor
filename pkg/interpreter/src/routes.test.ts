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

  test("context.get uses paused runtime frame over stale UI currentFrame", async () => {
    const moduleSnapshot = {
      id: "dark-server.ts",
      label: "dark/server.ts",
      modulePath: "/repo/dark/server.ts",
      protocolUrl: "ws://127.0.0.1:6502/",
      connection: {state: "connected", error: null},
      paused: true,
      breakpointsActive: true,
      scriptCount: 1,
      hasDump: true,
      dump: {
        timestamp: "2026-07-06T18:50:51.413Z",
        reason: "other",
        hitBreakpoints: [],
        frames: [
          {
            index: 0,
            function: "matter",
            url: "r/dark/dark.ts",
            line: 75,
            column: 3,
            sourceKind: "sourcemap",
            scriptId: "11",
            scopes: {local: [], closure: []},
          },
          {
            index: 1,
            function: "",
            url: "r/dark/dark.ts",
            line: 18,
            column: 15,
            sourceKind: "sourcemap",
            scriptId: "11",
            scopes: {local: [], closure: []},
          },
        ],
      },
      target: {state: "running"},
    }
    const server = startHttpServer(({
      host: "127.0.0.1",
      port: 0,
      modules: {
        list: () => [],
        snapshots: () => [moduleSnapshot],
        onEvent: () => {},
        get: (id: string) => id === moduleSnapshot.id ? {snapshot: () => moduleSnapshot} : undefined,
      },
      logger: {
        status: () => {},
        event: () => {},
        onEvent: () => {},
      },
      eventLogPath: ".events.log",
      consoleLogPath: ".console.log",
    }) as unknown as Parameters<typeof startHttpServer>[0])

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    try {
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), {once: true})
        ws.addEventListener("error", () => reject(new Error("test websocket failed to open")), {once: true})
      })
      ws.send(JSON.stringify({
        type: "module-context",
        moduleId: moduleSnapshot.id,
        context: {
          processId: moduleSnapshot.id,
          moduleId: moduleSnapshot.id,
          displayId: "module:dark-server.ts",
          label: moduleSnapshot.label,
          updatedAt: "2026-07-06T18:50:51.301Z",
          display: {active: true, visible: true, order: 3},
          source: {
            state: "paused",
            location: "r/dark/dark.ts:18",
            identity: {
              scriptId: "11",
              scriptUrl: "/repo/dark/dark.ts",
              sourceUrl: "r/dark/dark.ts",
              key: "r/dark/dark.ts",
            },
            dirty: false,
            cursor: {line: 18, column: 15},
            selection: null,
            selections: [],
          },
          activeFrameIndex: 0,
          currentFrame: {index: 0, function: "", url: "r/dark/dark.ts", line: 18, column: 15, sourceKind: "sourcemap", scriptId: "11"},
          scopes: {expanded: [], detail: null},
          terminal: {focused: false, pendingInput: "", promptVisible: false, selection: null},
        },
      }))
      await new Promise((resolve) => setTimeout(resolve, 20))

      const response = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          tool_uses: [
            {recipient_name: "context.get", parameters: {}},
            {recipient_name: "process.context", parameters: {processId: moduleSnapshot.id}},
          ],
        }),
      })
      const body = await response.json() as {results: Array<{result: {context: Record<string, unknown>}}>}
      for (const result of body.results) {
        const context = result.result.context as {currentFrame: {function: string; line: number}; source: {location: string; cursor: unknown; identity: unknown}; updatedAt: string}
        expect(context.currentFrame.function).toBe("matter")
        expect(context.currentFrame.line).toBe(75)
        expect(context.source.location).toBe("r/dark/dark.ts:75")
        expect(context.source.cursor).toEqual({line: 18, column: 15})
        expect(context.source.identity).toEqual({
          scriptId: "11",
          scriptUrl: "/repo/dark/dark.ts",
          sourceUrl: "r/dark/dark.ts",
          key: "r/dark/dark.ts",
        })
        expect(context.updatedAt).toBe("2026-07-06T18:50:51.413Z")
      }
    } finally {
      ws.close()
      server.stop(true)
    }
  })

  test("source.locate reports ambiguity and can select an occurrence", async () => {
    const cwd = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "metafor-source-locate-"))
    const sourcePath = join(dir, "dark.ts")
    writeFileSync(sourcePath, [
      "export async function first(part: {value: string}) {",
      "  await matter(part.value)",
      "}",
      "export async function second(part: {value: string}) {",
      "  await matter(part.value)",
      "}",
      "",
    ].join("\n"), "utf8")
    process.chdir(dir)

    const moduleId = "dark-server.ts"
    const fakeModule = {id: moduleId}
    const server = startHttpServer(({
      host: "127.0.0.1",
      port: 0,
      modules: {
        list: () => [],
        snapshots: () => [],
        onEvent: () => {},
        get: (id: string) => id === moduleId ? fakeModule : undefined,
      },
      logger: {
        status: () => {},
        event: () => {},
        onEvent: () => {},
      },
      eventLogPath: join(dir, ".events.log"),
      consoleLogPath: join(dir, ".console.log"),
    }) as unknown as Parameters<typeof startHttpServer>[0])

    try {
      const ambiguousResponse = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({tool_uses: [{recipient_name: "source.locate", parameters: {processId: moduleId, sourceUrl: "r/dark.ts", text: "await matter(part.value)"}}]}),
      })
      const ambiguousBody = await ambiguousResponse.json() as {results: Array<{ok: boolean; error: string; result: {matchCount: number; matches: Array<{line: number}>}}>}
      expect(ambiguousBody.results[0]!.ok).toBe(false)
      expect(ambiguousBody.results[0]!.error).toBe("ambiguous source locator")
      expect(ambiguousBody.results[0]!.result.matchCount).toBe(2)
      expect(ambiguousBody.results[0]!.result.matches.map((match) => match.line)).toEqual([2, 5])

      const occurrenceResponse = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({tool_uses: [{recipient_name: "source.locate", parameters: {processId: moduleId, sourceUrl: "r/dark.ts", text: "await matter(part.value)", occurrence: 2, contextLines: 1}}]}),
      })
      const occurrenceBody = await occurrenceResponse.json() as {results: Array<{ok: boolean; result: {match: {line: number; column: number; context: {text: string}}}}>}
      expect(occurrenceBody.results[0]!.ok).toBe(true)
      expect(occurrenceBody.results[0]!.result.match.line).toBe(5)
      expect(occurrenceBody.results[0]!.result.match.column).toBe(2)
      expect(occurrenceBody.results[0]!.result.match.context.text).toContain("4\texport async function second")
    } finally {
      server.stop(true)
      process.chdir(cwd)
      rmSync(dir, {recursive: true, force: true})
    }
  })

  test("breakpoint.set accepts source locator and rejects contradictory line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-breakpoint-locate-"))
    const sourcePath = join(dir, "dark.ts")
    writeFileSync(sourcePath, [
      "export async function run(part: {value: string}) {",
      "  await matter(part.value)",
      "}",
      "",
    ].join("\n"), "utf8")

    const moduleId = "dark-server.ts"
    const registrations: Array<Record<string, unknown>> = []
    const fakeModule = {
      id: moduleId,
      label: "dark/server.ts",
      snapshots: {scripts: []},
      breakpoints: {
        add: (spec: Record<string, unknown>) => {
          const registration = {id: `bp-${registrations.length + 1}`, spec, installed: []}
          registrations.push(registration)
          return registration
        },
        armPendingByUrl: async () => {},
        applyToScripts: async () => {},
        get registrations() {
          return registrations
        },
      },
    }
    const server = startHttpServer(({
      host: "127.0.0.1",
      port: 0,
      modules: {
        list: () => [],
        snapshots: () => [],
        onEvent: () => {},
        get: (id: string) => id === moduleId ? fakeModule : undefined,
      },
      logger: {
        status: () => {},
        event: () => {},
        onEvent: () => {},
      },
      eventLogPath: join(dir, ".events.log"),
      consoleLogPath: join(dir, ".console.log"),
    }) as unknown as Parameters<typeof startHttpServer>[0])

    try {
      const setResponse = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({tool_uses: [{recipient_name: "breakpoint.set", parameters: {processId: moduleId, sourceUrl: sourcePath, text: "await matter(part.value)"}}]}),
      })
      const setBody = await setResponse.json() as {results: Array<{ok: boolean; result: {breakpoint: {spec: {sourceUrl: string; line: number; column: number}}; sourceMatch: {line: number; column: number}}}>}
      expect(setBody.results[0]!.ok).toBe(true)
      expect(setBody.results[0]!.result.breakpoint.spec).toMatchObject({sourceUrl: sourcePath, line: 2, column: 2})
      expect(setBody.results[0]!.result.sourceMatch).toMatchObject({line: 2, column: 2})

      const mismatchResponse = await fetch(`http://127.0.0.1:${server.port}/tools`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({tool_uses: [{recipient_name: "breakpoint.set", parameters: {processId: moduleId, sourceUrl: sourcePath, line: 1, text: "await matter(part.value)"}}]}),
      })
      const mismatchBody = await mismatchResponse.json() as {results: Array<{ok: boolean; error: string; result: {sourceMatch: {line: number; column: number}}}>}
      expect(mismatchBody.results[0]!.ok).toBe(false)
      expect(mismatchBody.results[0]!.error).toBe("line does not match source locator")
      expect(mismatchBody.results[0]!.result.sourceMatch).toMatchObject({line: 2, column: 2})
    } finally {
      server.stop(true)
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
