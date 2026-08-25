import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldValueApplyRequest, MetaProcessExecutionReadRequest} from "shared/protocol/metafor/observation"
import {
  BOUNDARY_FIELD_VALUE_PLAN_METHOD,
  BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
} from "shared/protocol/boundary/runtime"
import type {ForceMessage, ForceMessageInput, SourcedForceMessage} from "shared/protocol/force/message"
import {sourceForceMessage, unsourceForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {ProcessExecutionGrant, ProcessResultProposal} from "shared/protocol/force/execution"
import {open, type BoundaryDatabase} from "boundary/sqlite"
import {readBoundaryGraphProjection} from "../../boundary/graph/runtime.ts"
import {BoundaryRuntimeRpcService} from "../../boundary/runtime-rpc.ts"
import {DarkForceHistory} from "../force/history.ts"
import {ForceLifecycle} from "../force/lifecycle.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "../force/store.ts"
import {MetaRuntimeRpcService} from "./runtime.ts"

const ROOT = parseMetaAddress("test/agent-runtime")!
const locator = {root: ROOT, pointer: "/runtime/roots/0" as const, meta: ROOT}
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("agent runtime input and Process observation", () => {
  test("changes one Field, observes State, and reads the exact committed Process outcome", async () => {
    const boundary: BoundaryDatabase = await open(":memory:")
    try {
      for (const part of [
        {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Agent Runtime"}},
        {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "input", type: "number", default: 0}},
        {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 2, key: "output", type: "number", default: 0}},
        {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "idle", position: 0}},
        {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 2, name: "ready", position: 1}},
      ] as ParticleInput[]) await boundary.materialize(message(part))
      const fields = await boundary.projection.sql<Array<{id: number; key: string}>>`
        SELECT id, key FROM field WHERE wimp = ${ROOT}
      `
      const inputField = Number(fields.find(({key}) => key === "input")!.id)
      const outputField = Number(fields.find(({key}) => key === "output")!.id)
      await boundary.materialize(message({
        part: "inflaton",
        op: "add",
        path: "process",
        value: {
          wimp: ROOT,
          id: 1,
          key: "ready",
          type: "action",
          env: ["server"],
          action: {src: "./ready.ts", read: [inputField]},
          success: {src: "({update}) => update({output: 8})", read: [outputField], write: [outputField]},
        },
      }))
      const atom = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM atom WHERE wimp = ${ROOT}
      `)[0]!.id)
      const process = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM process WHERE wimp = ${ROOT} AND key = ${"ready"}
      `)[0]!.id)

      const directory = mkdtempSync(join(tmpdir(), "metafor-runtime-rpc-"))
      directories.push(directory)
      const history = new DarkForceHistory(join(directory, "v1"), {
        cutId: "agent-runtime-cut",
        startedAt: "2026-08-04T12:00:00.000Z",
      })
      const deliveries = Object.fromEntries(forceDomains.map((domain) => [domain, [] as SourcedForceMessage[]])) as Record<ForceDomain, SourcedForceMessage[]>
      const channels = Object.fromEntries(forceDomains.map((domain) => [domain, {
        domain,
        send(value: SourcedForceMessage) { deliveries[domain].push(structuredClone(value)) },
      }])) as ForceStore
      const lifecycle = new ForceLifecycle(history)
      lifecycle.start(channels)
      for (const domain of forceDomains) lifecycle.channelReady(domain)

      const boundaryRpc = new BoundaryRuntimeRpcService(boundary)
      const service = new MetaRuntimeRpcService(history, lifecycle, {
        async call(_target: string, method: string, input: unknown) {
          if (method === BOUNDARY_FIELD_VALUE_PLAN_METHOD) return await boundaryRpc.planFieldValue(input)
          if (method === BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD) return await boundaryRpc.projectProcessExecution(input)
          throw new Error(`Unexpected Boundary runtime method: ${method}`)
        },
      } as never)
      const publish = async (domain: ForceDomain, input: ForceMessageInput): Promise<void> => {
        const sourced = sourceForceMessage(input, domain)
        const decision = await lifecycle.acceptParticle(domain, sourced)
        if (!decision.ok) throw new Error(decision.error)
        if (domain === "boundary") return
        const commit = await boundary.materialize(sourced)
        for (const derived of commit?.messages ?? []) {
          const accepted = await lifecycle.acceptParticle("boundary", sourceForceMessage(unsourceForceMessage(derived), "boundary"))
          if (!accepted.ok) throw new Error(accepted.error)
        }
      }

      const fieldRequest: MetaFieldValueApplyRequest = {
        contractVersion: 1,
        atom: locator,
        field: "input",
        value: 4,
        expectedFrontier: {cutId: "agent-runtime-cut", throughSequence: 0, retroactiveComplete: false},
      }
      const fieldReceipt = await service.applyFieldValue(fieldRequest)
      expect(fieldReceipt.acceptance).toEqual({cutId: "agent-runtime-cut", sequence: 1, id: "agent-runtime-cut:1"})
      const external = deliveries.boundary.shift()
      if (!external) throw new Error("Field input was not routed to Boundary")
      const fieldCommit = await boundary.materialize(external)
      for (const derived of fieldCommit?.messages ?? []) {
        const decision = await lifecycle.acceptParticle("boundary", sourceForceMessage(unsourceForceMessage(derived), "boundary"))
        if (!decision.ok) throw new Error(decision.error)
      }

      await publish("matrix", {parts: [{part: "photon", op: "replace", path: atom, ts: 3, value: "ready"}]})
      const execution = "agent-runtime-execution"
      await publish("matrix", {parts: [{part: "photon", op: "test", path: atom, from: execution, ts: 4, value: "ready"}]})
      const grant: ProcessExecutionGrant = {processExecutionId: execution, fields: {[String(inputField)]: 4}}
      await publish("energy", {parts: [{part: "z", op: "copy", path: atom, from: "energy-runtime", ts: 5, value: grant}]})
      const proposal: ProcessResultProposal = {
        processExecutionId: execution,
        processId: process,
        fields: {[String(outputField)]: 8},
      }
      await publish("energy", {parts: [{part: "w+", op: "replace", path: atom, from: "energy-runtime", ts: 6, value: proposal}]})

      const graph = await readBoundaryGraphProjection(boundary, {})
      expect(graph.runtime.roots[0]).toMatchObject({
        kind: "atom",
        meta: ROOT,
        state: "ready",
        values: {input: 4, output: 8},
      })
      const processRequest: MetaProcessExecutionReadRequest = {
        contractVersion: 1,
        atom: locator,
        process: "ready",
        execution,
      }
      await expect(service.readProcessExecution(processRequest)).resolves.toMatchObject({
        status: "committed",
        acceptance: {cutId: "agent-runtime-cut", sequence: 4, id: "agent-runtime-cut:4"},
        settlement: {cutId: "agent-runtime-cut", sequence: 8, id: "agent-runtime-cut:8"},
        outcome: {fields: {output: 8}},
        frontier: {cutId: "agent-runtime-cut", throughSequence: 8, retroactiveComplete: false},
      })
    } finally {
      await boundary.close()
    }
  })
})
