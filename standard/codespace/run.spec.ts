import {expect, test} from "bun:test"
import {CODESPACE_META, CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, type CodespaceResult} from "@metafor/types/metafor/codespace"
import type {OracleProcessEnvironment, OracleProcessOperations} from "@metafor/types/metafor/environment"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import runCodespace from "./run"
import {evaluateMetaSource} from "../../quantum/dark/load"

test("compiled Tool declaration retains its closed acknowledgement write-set and autonomous FSM", async () => {
  const sourcePath = `${import.meta.dir}/meta.ts`
  const meta = await evaluateMetaSource(await Bun.file(sourcePath).text(), {sourcePath})
  const process = meta.processes?.[0]?.declaration
  if (process?.type !== "action") throw new Error("Expected Tool action")
  expect(process.success?.write).toEqual(["ack", "ackId", "response", "error"])
  expect(meta.mass?.map(entry => entry.key)).toEqual(["receipt"])
})

function fixture() {
  let bytes = ""
  const writes: unknown[] = []
  const calls: string[] = []
  let fail = false
  const meta = parseMetaAddress(CODESPACE_META)!
  const graph: Graph = {schema: GRAPH_SCHEMA, root: meta, template: {}, runtime: {roots: [], reactions: []}}
  const environment: OracleProcessEnvironment = {
    async read() {return {contractVersion: 1, actor: {ref: "atom:1", meta}, scope: {kind: "full-root", root: meta}, graph,
      operations: [CODESPACE_STATUS_METHOD, CODESPACE_START_METHOD].map(name => ({name, description: "assigned", inputSchema: {type: "object", properties: {}, additionalProperties: false}}))}},
    async call<Name extends keyof OracleProcessOperations>(name: Name): Promise<OracleProcessOperations[Name]["result"]> {
      calls.push(name)
      if (name === CODESPACE_START_METHOD) expect(JSON.parse(bytes).requests.at(-1).state).toBe("pending")
      if (fail) throw new Error("native outcome uncertain")
      const result: CodespaceResult = {schema: "metafor/codespace/v1", version: 1, operation: name === CODESPACE_START_METHOD ? "start" : "status",
        target: {name: "fixture-space", account: "fixture-account"}, state: "Available", outcome: name === CODESPACE_START_METHOD ? "already-running" : "observed"}
      return result as OracleProcessOperations[Name]["result"]
    },
  }
  const mass = {receipt: {async readText() {return bytes}, async write(value: unknown) {writes.push(structuredClone(value)); bytes = JSON.stringify(value)}}}
  const run = (id: string, operation: "start" | "status", capability: OracleProcessEnvironment | undefined = environment) =>
    runCodespace({request: JSON.stringify({id, operation}), mass, environment: capability, signal: new AbortController().signal})
  return {run, calls, writes, fail() {fail = true}, setBytes(value: string) {bytes = value}}
}

test("status and start persist exact receipts; completed identity replays without a native call", async () => {
  const f = fixture()
  expect(await f.run("start-1", "start")).toMatchObject({ack: true, ackId: "start-1", error: null})
  expect(f.writes).toHaveLength(2)
  const replay = await f.run("start-1", "start")
  expect(replay.error).toBeNull()
  expect(f.calls).toEqual([CODESPACE_START_METHOD])
  expect(await f.run("status-1", "status")).toMatchObject({ackId: "status-1", error: null})
  expect(f.calls).toEqual([CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD])
  expect(await f.run("start-1", "status")).toMatchObject({ackId: "start-1", response: null})
  expect(f.calls).toHaveLength(2)
})

test("interrupted start is retained and never automatically retried after restoration", async () => {
  const f = fixture()
  f.fail()
  expect(await f.run("uncertain", "start")).toMatchObject({ack: true, ackId: "uncertain", error: "native outcome uncertain"})
  const retained = JSON.stringify(f.writes.at(-1))
  const restored = fixture()
  restored.setBytes(retained)
  expect((await restored.run("uncertain", "start")).error).toContain("uncertain")
  expect(restored.calls).toEqual([])
  expect(await restored.run("observe", "status")).toMatchObject({error: null})
  expect(restored.calls).toEqual([CODESPACE_STATUS_METHOD])
})

test("invalid storage, malformed requests and missing grants fail without native effects", async () => {
  const f = fixture()
  f.setBytes('{"version":1,"requests":[{"id":"bad","operation":"start","state":"completed"}]}')
  expect((await f.run("valid", "start")).error).toContain("ledger")
  expect(f.calls).toEqual([])
  const absent = fixture()
  expect((await runCodespace({request: '{"id":"x","operation":"start"}', mass: {receipt: {async readText() {return ""}, async write() {throw new Error("must not write")}}}, signal: new AbortController().signal})).error).toContain("not assigned")
  expect((await absent.run("\n", "start")).error).toContain("Invalid")
  expect(absent.calls).toEqual([])
})
