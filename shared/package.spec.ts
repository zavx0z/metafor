import {describe, expect, test} from "bun:test"

describe("shared package public API", () => {
  test("resolves server Force and Oracle transports through public subpaths", async () => {
    const force = await import("shared/transport/force")
    const checkpoint = await import("shared/transport/force/checkpoint")
    const oracle = await import("shared/transport/oracle")

    expect(Object.keys(force)).toEqual(["Force"])
    expect(force.Force).toBeFunction()
    expect(checkpoint.FORCE_CHECKPOINT_SESSION_METHOD).toBe("force.checkpoint.session.open")
    expect(checkpoint.ForceCheckpointDomainSideband).toBeFunction()
    expect(Object.keys(oracle).sort()).toEqual([
      "ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES",
      "ORACLE_WEBSOCKET_PATH",
      "OracleRpcPeer",
      "OracleRpcRemoteError",
      "OracleTransport",
      "OracleWebSocketTransport",
      "createHttpOracleChannelRegistry",
      "createOracleWebSocketChannelRegistry",
      "isLoopbackAddress",
      "normalizeOracleIdentity",
      "readBearerToken",
      "readHttpOracleChannel",
      "readHttpOracleChannelOpening",
      "readOracleWebSocketData",
    ])
    expect(oracle.OracleTransport).toBeFunction()
    expect(oracle.OracleWebSocketTransport).toBeFunction()
    expect(oracle.OracleRpcPeer).toBeFunction()
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
    expect(manifest.exports["./transport/oracle"]).toEqual({
      browser: "./transport/oracle/web.ts",
      bun: "./transport/oracle/server.ts",
      node: "./transport/oracle/server.ts",
      default: "./transport/oracle/web.ts",
    })
  })

  test("exports one environment-independent protocol", async () => {
    const force = await import("shared/protocol/force/message")
    const oracle = await import("shared/protocol/oracle/rpc")

    expect(Object.keys(force).sort()).toEqual(["sourceForceMessage", "unsourceForceMessage"])
    expect(oracle.ORACLE_RPC_VERSION).toBe(1)
  })

  test("exports the environment-independent normalized Matter law", async () => {
    const matter = await import("shared/metafor/matter")

    expect(Object.keys(matter)).toEqual(["resolveMatterFuzzySources", "validateMatterSchema"])
    expect(matter.resolveMatterFuzzySources).toBeFunction()
    expect(matter.validateMatterSchema).toBeFunction()
  })
})
