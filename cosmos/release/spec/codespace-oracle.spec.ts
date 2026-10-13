import {expect, test} from "bun:test"
import {CODESPACE_HOST, CODESPACE_META, CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, type CodespaceResult} from "@metafor/types/metafor/codespace"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import {OracleRpcPeer} from "shared/transport/oracle"
import {OracleRouter} from "../../../quantum/dark/oracle/router"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {createCodespaceHostOracle} from "../server/codespace-oracle"

test("real public local RPC registers closed capabilities, rejects other channels and verifies exact live Tool", async () => {
  const meta = parseMetaAddress(CODESPACE_META)!
  const graph: Graph = {schema: GRAPH_SCHEMA, root: meta, template: {[meta]: {name: "Tool", fields: [], superposition: [{name: "idle", transitions: null}], mass: [], processes: []}},
    runtime: {roots: [{kind: "atom", ref: "atom:17", meta, declaration: "#/template/@metafor~1codespace", state: "idle", values: {}, mass: []}], reactions: []}}
  const called: string[][] = []
  const host = createCodespaceHostOracle({assignment: {command: ["/fixture/python", "/fixture/helper"], account: "fixture-account", target: "fixture-space"},
    run: async argv => {called.push([...argv]); return {exitCode: 0, stdout: argv.includes("/user") ? "fixture-account" : JSON.stringify({name: "fixture-space", owner: "fixture-account", state: "Available"})}}})
  const dark = createLocalOracleChannelPair("dark", () => ["readGraph"])
  const darkPeer = new OracleRpcPeer(dark.peer)
  darkPeer.expose("readGraph", () => graph)
  const energy = createLocalOracleChannelPair("energy", () => [])
  const energyPeer = new OracleRpcPeer(energy.peer)
  const outsider = createLocalOracleChannelPair("browser", () => [])
  const outsiderPeer = new OracleRpcPeer(outsider.peer)
  const router = new OracleRouter()
  for (const channel of [dark.router, energy.router, outsider.router, host.channel]) router.attach(channel)
  const actor = {root: meta, ref: "atom:17", meta}
  try {
    expect(router.channels().find(channel => channel.identity === CODESPACE_HOST)?.methods).toEqual([CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD].sort())
    await expect(outsiderPeer.call(CODESPACE_HOST, CODESPACE_START_METHOD, {actor, requestId: "bad"})).rejects.toThrow("bound Tool")
    await expect(energyPeer.call(CODESPACE_HOST, CODESPACE_STATUS_METHOD, {actor: {...actor, ref: "atom:99"}})).rejects.toThrow("absent")
    await expect(energyPeer.call(CODESPACE_HOST, CODESPACE_START_METHOD, {actor, requestId: "x", shell: "run"})).rejects.toThrow("bound Tool")
    expect(called).toHaveLength(0)
    const result = await energyPeer.call<CodespaceResult>(CODESPACE_HOST, CODESPACE_STATUS_METHOD, {actor})
    expect(result).toMatchObject({operation: "status", outcome: "observed", target: {name: "fixture-space", account: "fixture-account"}})
    expect(called).toHaveLength(2)
  } finally {
    darkPeer.close(); energyPeer.close(); outsiderPeer.close()
    await host.close()
    await Promise.all([dark.peer.close(), energy.peer.close(), outsider.peer.close()])
  }
})
