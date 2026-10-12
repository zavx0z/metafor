import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {DARK_FORCE_STATUS_READ_METHOD} from "shared/protocol/oracle/health"
import {createDarkRuntime, type DarkRuntimeSocketData} from "./runtime.ts"

test("embedded Dark mounts on its caller listener, excludes Bulk and keeps Oracle reads before causal birth", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-headless-dark-"))
  const runtime = await createDarkRuntime({stateRoot: directory, cutId: "headless-test"})
  const server = Bun.serve<DarkRuntimeSocketData>({port: 0, hostname: "127.0.0.1",
    fetch: (request, current) => runtime.fetch(request, current), websocket: runtime.websocket,
  })
  const transport = new OracleTransport("test-reader", server.url)
  const peer = new OracleRpcPeer(transport.channel)
  try {
    await expect(createDarkRuntime({stateRoot: directory, cutId: "headless-test"})).rejects.toThrow("already active")
    await transport.open({methods: peer.methods(), waitMs: 1000})
    const status = await peer.call<{state: string, connectedDomains: string[]}>("dark", DARK_FORCE_STATUS_READ_METHOD, {})
    expect(status).toMatchObject({state: "starting", connectedDomains: ["dark"]})
    expect(runtime.status().requiredDomains).toEqual(["dark", "boundary", "matrix", "energy"])
    expect(runtime.handles("/initial")).toBeFalse()
    expect(runtime.handles("/")).toBeFalse()
    const denied = await fetch(new URL("/force", server.url), {method: "POST", body: "{}"})
    expect(denied.status).toBe(503)
    expect((await fetch(new URL("/ws?domain=bulk&id=excluded", server.url))).status).toBe(400)
    expect((await fetch(new URL("/oracle/ws?identity=bulk&id=excluded", server.url))).status).toBe(403)
    await expect(runtime.seed(["zavx0z/example"])).rejects.toThrow("running Force")
    let initialReads = 0
    await expect(runtime.applyInitialRootFields(() => {initialReads++; return {title: "untrusted-before-birth"}})).rejects.toThrow("unused fresh root")
    expect(initialReads).toBe(0)
    peer.close()
    await transport.close()
    await runtime.close()
    expect((await fetch(new URL("/force", server.url), {method: "POST", body: "{}"})).status).toBe(503)
    expect(runtime.status().state).toBe("stopped")
  } finally {
    peer.close()
    await transport.close()
    await runtime.close()
    await server.stop(true)
    await rm(directory, {recursive: true, force: true})
  }
})
