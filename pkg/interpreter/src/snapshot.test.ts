import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {SourceMapGenerator} from "source-map-js"
import {EventLogger} from "./logger.ts"
import type {ProtocolClient} from "./protocol-client.ts"
import {SnapshotStore} from "./snapshot.ts"

function inlineSourceStepMap(): string {
  const source = [
    "const before = 1",
    "",
    "globalThis.store = await open(STORE_PATH)",
    "",
    "const decodeSegment = (s: string): string => s.replace(/~1/g, \"/\")",
    "",
  ].join("\n")
  const generator = new SourceMapGenerator({file: "server.js"})
  generator.addMapping({
    generated: {line: 7, column: 0},
    original: {line: 3, column: 0},
    source: "r/dark/server.ts",
  })
  generator.addMapping({
    generated: {line: 8, column: 0},
    original: {line: 5, column: 0},
    source: "r/dark/server.ts",
  })
  generator.setSourceContent("r/dark/server.ts", source)
  const encoded = Buffer.from(generator.toString(), "utf8").toString("base64url")
  return `data:application/json;base64,${encoded}`
}

describe("SnapshotStore", () => {
  test("computes a source-level step-over target from the paused frame", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-snapshot-"))
    try {
      const client = {
        async request(): Promise<unknown> {
          return {}
        },
      } as unknown as ProtocolClient
      const store = new SnapshotStore({
        client,
        logger: new EventLogger(join(dir, "events.log")),
        dumpPath: join(dir, "state.json"),
      })
      store.handleScriptParsed({
        scriptId: "146",
        url: "/repo/dark/server.ts",
        sourceMapURL: inlineSourceStepMap(),
      })

      await store.handlePaused({
        reason: "Breakpoint",
        callFrames: [{
          callFrameId: "frame-1",
          functionName: "module code",
          location: {scriptId: "146", lineNumber: 6, columnNumber: 0},
          scopeChain: [],
        }],
      })

      expect(store.sourceStepOverTarget()).toEqual({
        location: {scriptId: "146", lineNumber: 7, columnNumber: 0},
        source: {url: "r/dark/server.ts", line: 5, column: 1},
        generated: {line: 7, column: 0},
      })
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
