import {afterEach, describe, expect, test} from "bun:test"
import {ORACLE_RPC_VERSION} from "shared/protocol/oracle/rpc"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {bulkOracleRoutes} from "./oracle-route.ts"

describe("Bulk Oracle callback route", () => {
  let bulk: ReturnType<typeof Bun.serve> | null = null
  let dark: ReturnType<typeof Bun.serve> | null = null
  let transport: OracleTransport | null = null

  afterEach(async () => {
    await transport?.close()
    bulk?.stop(true)
    dark?.stop(true)
    transport = null
    bulk = null
    dark = null
  })

  test("forwards the authenticated Dark callback to Bulk's registered Oracle transport", async () => {
    let callback = ""
    dark = Bun.serve({
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname
        if (path === "/oracle/channels") {
          const opening = await request.json() as {identity: string; callback: string}
          expect(opening.identity).toBe("bulk")
          callback = opening.callback
          return Response.json({version: ORACLE_RPC_VERSION, channel: callback}, {status: 201})
        }
        if (path === "/oracle/channel" && request.method === "DELETE") return Response.json({ok: true})
        return new Response("unexpected request", {status: 500})
      },
    })
    transport = new OracleTransport("bulk", dark.url)
    const peer = new OracleRpcPeer(transport.channel)
    peer.expose("bulk.sideband.probe", async (_params, context) => ({source: context.source}))
    bulk = Bun.serve({port: 0, routes: bulkOracleRoutes(transport)})

    await transport.open({methods: peer.methods(), endpoint: new URL("/oracle/channel", bulk.url)})
    const response = await fetch(new URL("/oracle/channel", bulk.url), {
      method: "POST",
      headers: {
        authorization: `Bearer ${callback}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: ORACLE_RPC_VERSION,
        id: "dark-sideband-probe",
        source: "dark",
        target: "bulk",
        method: "bulk.sideband.probe",
        params: {},
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "dark-sideband-probe",
      ok: true,
      result: {source: "dark"},
    })
  })
})
