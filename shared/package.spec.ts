import {describe, expect, test} from "bun:test"

describe("shared package public API", () => {
  test("resolves server Force and Monad transports through public subpaths", async () => {
    const force = await import("shared/transport/force")
    const monad = await import("shared/transport/monad")

    expect(Object.keys(force)).toEqual(["Force"])
    expect(force.Force).toBeFunction()
    expect(Object.keys(monad).sort()).toEqual([
      "MonadRpcPeer",
      "MonadRpcRemoteError",
      "MonadTransport",
      "createHttpMonadChannelRegistry",
      "isLoopbackAddress",
      "normalizeMonadIdentity",
      "readBearerToken",
      "readHttpMonadChannel",
      "readHttpMonadChannelOpening",
    ])
    expect(monad.MonadTransport).toBeFunction()
    expect(monad.MonadRpcPeer).toBeFunction()
  })

  test("keeps server and web implementations behind the same conditional exports", async () => {
    const manifest = await Bun.file(new URL("./package.json", import.meta.url)).json() as {
      exports: Record<string, Record<string, string>>
    }

    expect(manifest.exports["./transport/force"]).toEqual({
      browser: "./transport/force/web.ts",
      bun: "./transport/force/server.ts",
      node: "./transport/force/server.ts",
      default: "./transport/force/web.ts",
    })
    expect(manifest.exports["./transport/monad"]).toEqual({
      browser: "./transport/monad/web.ts",
      bun: "./transport/monad/server.ts",
      node: "./transport/monad/server.ts",
      default: "./transport/monad/web.ts",
    })
  })

  test("exports one environment-independent protocol", async () => {
    const force = await import("shared/protocol/force/message")
    const monad = await import("shared/protocol/monad/rpc")

    expect(Object.keys(force).sort()).toEqual(["sourceForceMessage", "unsourceForceMessage"])
    expect(monad.MONAD_RPC_VERSION).toBe(1)
  })
})
