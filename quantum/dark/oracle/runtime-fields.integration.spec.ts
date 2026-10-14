import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {parseMetaAddress, READ_GRAPH_METHOD, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {MassCatalog} from "../../../shared/mass"
import {BOUNDARY_FIELDS_VALUE_PLAN_METHOD} from "shared/protocol/boundary/runtime"
import {sourceForceMessage, unsourceForceMessage, type SourcedForceMessage} from "shared/protocol/force/message"
import type {ForceMessageInput} from "shared/protocol/force/message"
import type {Force} from "shared/transport/force"
import {resolveCanonicalFieldValuesCommit} from "shared/protocol/force/fields"
import {isMetaFieldsValueApplyRefusal, type MetaFieldsValueApplyRequest} from "shared/protocol/metafor/observation"
import {open} from "../../boundary/sqlite"
import {readBoundaryGraphProjection} from "../../boundary/graph/runtime"
import {BoundaryRuntimeRpcService} from "../../boundary/runtime-rpc"
import {matterParticles} from "../dark"
import {evaluateMetaSource} from "../load"
import {DarkForceHistory} from "../force/history"
import {ForceLifecycle} from "../force/lifecycle"
import {forceDomains, type ForceStore} from "../force/store"
import {DarkForceTimeController} from "../time-control"
import {MetaRuntimeRpcService} from "./runtime"
import {prepareMatrixBirth} from "../../matrix/birth"
import {weak$} from "../../matrix/weak"
import {readMatrixProcessFields} from "../../matrix/graph/projection"
import {EnergyPeerOracleKernel} from "../../energy/peer-oracle"
import {assembleGraph} from "../graph/oracle"
import {DARK_DECLARATION_PROJECTION_METHOD, readDarkDeclarationProjection} from "../graph/declaration"
import {BOUNDARY_GRAPH_PROJECTION_METHOD} from "shared/protocol/boundary/runtime"
import {DARK_FORCE_HISTORY_READ_METHOD} from "shared/protocol/metafor/observation"

test("один Atom сохраняет два Field атомарно; CAS, mixed types и entanglement не дают частичного результата", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-atomic-fields-"))
  const rootAddress = parseMetaAddress("capsule")!
  const childAddress = parseMetaAddress("test/atomic-child")!
  const leafAddress = parseMetaAddress("test/atomic-leaf")!
  const boundary = await open(":memory:", {massCatalog: new MassCatalog(join(directory, "mass"))})
  const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
  let matrix: typeof import("../../matrix/matrix") | undefined
  let energy: EnergyPeerOracleKernel | undefined
  const energySnapshots: Array<RuntimeAtom["values"]> = []
  const emitted: ForceMessageInput[] = []
  const matrixPort: Pick<Force, "onImpulse" | "onImpulseError" | "impulse"> = {
    onImpulse: () => {}, onImpulseError: () => {}, impulse: message => {emitted.push(structuredClone(message))},
  }
  try {
    const rootMeta = await evaluateMetaSource([
      'export default MetaFor("Atomic Fields").fields(field => ({',
      'count: field.number.required(0), other: field.number.required(0),',
      'mode: field.enum("idle", "ready").required("idle"), items: field.array.required([])}))',
      '.superposition({idle:{partial:{count:{gt:5},mode:{eq:"idle"}},ready:{count:{gt:5},mode:{eq:"ready"}}},partial:null,ready:null}).mass(() => ({})).energy().processes(() => []).reactions(() => [])',
      '.matter(({value,html}) => html`<meta-for src="test/atomic-child" fields=${{left:value.count,right:value.other}} />${value.items.map(() => html`<meta-for src="test/atomic-leaf" />`)}`).bulk()',
    ].join("\n"))
    const childMeta = await evaluateMetaSource('export default MetaFor("Child").fields(field => ({left:field.number.optional(0),right:field.number.required(0)})).superposition({ready:{}}).mass(() => ({})).energy().processes(() => []).reactions(() => []).matter(({html}) => html``).bulk()')
    const leafMeta = await evaluateMetaSource('export default MetaFor("Leaf").fields(() => ({})).superposition({ready:{}}).mass(() => ({})).energy().processes(() => []).reactions(() => []).matter(({html}) => html``).bulk()')
    const loadMeta = async (address: string) => {
      if (address === rootAddress) return rootMeta
      if (address === childAddress) return childMeta
      if (address === leafAddress) return leafMeta
      throw new Error("Unexpected fixture source")
    }
    for await (const particle of matterParticles(rootAddress, loadMeta)) await boundary.materialize({parts: [particle]})
    const root = async (): Promise<RuntimeAtom> => {
      const projection = await readBoundaryGraphProjection(boundary, {})
      const node = projection.runtime.roots[0]
      if (!node || node.kind !== "atom") throw new Error("Fixture root Atom absent")
      return node
    }
    const locator = {root: rootAddress, ref: (await root()).ref, meta: rootAddress}
    const history = new DarkForceHistory(join(directory, "history"), {cutId: "atomic-fields-cut", startedAt: "2026-10-13T00:00:00.000Z"})
    const incoming: SourcedForceMessage[] = []
    const channels = Object.fromEntries(forceDomains.map(domain => [domain, {domain, send(message: SourcedForceMessage) {
      if (domain === "boundary") incoming.push(structuredClone(message))
    }}])) as ForceStore
    const lifecycle = new ForceLifecycle(history)
    lifecycle.start(channels)
    for (const domain of forceDomains) lifecycle.channelReady(domain)
    let applied = 0
    let held = false
    const causal = new DarkForceTimeController(lifecycle, {
      async holdUnderClosedAdmission() {
        expect(applied).toBe(history.status().sequence)
        held = true
        return {cutId: "atomic-fields-cut", acceptanceSequence: applied, phase: "held", domains: []}
      },
      releaseAdmissionHold() {
        held = false
        return {cutId: "atomic-fields-cut", acceptanceSequence: applied, phase: "open", domains: []}
      },
    })
    const boundaryRpc = new BoundaryRuntimeRpcService(boundary)
    const service = new MetaRuntimeRpcService(history, lifecycle, {
      async call(target: string, method: string, input: unknown) {
        expect(held).toBe(true)
        expect(target).toBe("boundary")
        expect(method).toBe(BOUNDARY_FIELDS_VALUE_PLAN_METHOD)
        return await boundaryRpc.planFieldsValue(input)
      },
    } as never, causal)
    const request = (updates: MetaFieldsValueApplyRequest["updates"], atom = locator): MetaFieldsValueApplyRequest => ({
      contractVersion: 1, atom, updates, expectedFrontier: {cutId: "atomic-fields-cut", throughSequence: history.status().sequence, retroactiveComplete: false},
    })
    const commit = async (input: MetaFieldsValueApplyRequest, category: "gluon" | "higgs") => {
      const before = history.status().sequence
      const receipt = await service.applyFieldsValue(input)
      expect(receipt.acceptance.sequence).toBe(before + 1)
      expect(history.status().sequence).toBe(before + 1)
      expect(incoming).toHaveLength(1)
      const particle = incoming.shift()!
      expect(particle.parts).toHaveLength(1)
      expect(particle.parts[0].part).toBe(category)
      expect(Object.keys((particle.parts[0].value as {fields: object}).fields)).toHaveLength(2)
      const result = await boundary.materialize(particle)
      const atomConsequences = result?.messages.filter(message => message.parts[0].path === Number(input.atom.ref.slice(5)) && ["gluon", "higgs"].includes(message.parts[0].part)) ?? []
      expect(atomConsequences).toHaveLength(1)
      expect(atomConsequences[0]!.parts[0].part).toBe(category)
      expect(resolveCanonicalFieldValuesCommit(atomConsequences[0]!.parts[0].value)).not.toBeNull()
      for (const consequence of result?.messages ?? []) {
        // Native Force channel сериализует optional projection properties в JSON.
        const wire = JSON.parse(JSON.stringify(sourceForceMessage(unsourceForceMessage(consequence), "boundary"))) as SourcedForceMessage
        const accepted = await lifecycle.acceptParticle("boundary", wire)
        if (!accepted.ok) throw new Error(accepted.error)
        if (matrix) await Promise.resolve(matrixPort.onImpulse!(wire))
        energy?.observe(wire)
      }
      applied = history.status().sequence
      expect(held).toBe(false)
    }
    await commit(request([{field: "count", value: 4, expectedValue: 0}, {field: "other", value: 6, expectedValue: 0}]), "gluon")
    expect((await root()).values).toMatchObject({count: 4, other: 6})
    const beforeConflict = history.status().sequence
    const conflict = await service.applyFieldsValue(request([
      {field: "count", value: 40, expectedValue: 4}, {field: "other", value: 60, expectedValue: 0},
    ])).catch(error => error)
    expect(isMetaFieldsValueApplyRefusal(conflict.data)).toBe(true)
    expect(conflict.data.reason).toBe("value_mismatch")
    expect(history.status().sequence).toBe(beforeConflict)
    expect((await root()).values).toMatchObject({count: 4, other: 6})
    await expect(service.applyFieldsValue(request([
      {field: "count", value: 40, expectedValue: 4}, {field: "mode", value: "unknown", expectedValue: "idle"},
    ]))).rejects.toThrow("enum declaration")
    expect(history.status().sequence).toBe(beforeConflict)
    expect((await root()).values.count).toBe(4)
    Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    await prepareMatrixBirth(await boundary.initialState())
    matrix = await import(`../../matrix/matrix.ts?atomic-fields=${crypto.randomUUID()}`)
    await matrix!.startMatrixForce(() => matrixPort)
    energy = new EnergyPeerOracleKernel({refreshProviders: false, profileControl: true, peer: {
      async call(_target: string, method: string) {
        if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier: request([]).expectedFrontier} as never
        if (method !== READ_GRAPH_METHOD) throw new Error(`Unexpected Energy fixture RPC: ${method}`)
        const graph = await assembleGraph({async call(_domain: string, projection: string) {
          if (projection === BOUNDARY_GRAPH_PROJECTION_METHOD) return await readBoundaryGraphProjection(boundary, {}) as never
          if (projection === DARK_DECLARATION_PROJECTION_METHOD) return await readDarkDeclarationProjection({root: rootAddress}, loadMeta) as never
          throw new Error("Unexpected Graph projection")
        }}, {})
        energySnapshots.push(structuredClone((graph.runtime.roots[0] as RuntimeAtom).values))
        return graph as never
      },
    }})
    await energy.readProfiles()
    energySnapshots.length = 0
    const matrixState = () => {
      const index = matrix!.gravity$.getBraneIndexByAtomId(Number(locator.ref.slice(5)))!
      return matrix!.matrix$.getStateName(index, matrix!.matrix$.states[index]!)
    }
    expect(matrixState()).toBe("idle")
    emitted.length = 0
    const liveConflict = await service.applyFieldsValue(request([
      {field: "count", value: 7, expectedValue: 4}, {field: "mode", value: "ready", expectedValue: "ready"},
    ])).catch(error => error)
    expect(liveConflict.data.reason).toBe("value_mismatch")
    await expect(service.applyFieldsValue(request([
      {field: "count", value: 7, expectedValue: 4}, {field: "mode", value: "invalid", expectedValue: "idle"},
    ]))).rejects.toThrow("enum declaration")
    expect(history.status().sequence).toBe(beforeConflict)
    expect(incoming).toHaveLength(0)
    expect(emitted).toHaveLength(0)
    expect(energySnapshots).toHaveLength(0)
    expect(matrixState()).toBe("idle")
    expect((await root()).values).toMatchObject({count: 4, other: 6, mode: "idle", items: []})
    await commit(request([{field: "count", value: 7, expectedValue: 4}, {field: "mode", value: "ready", expectedValue: "idle"}]), "higgs")
    await energy.readProfiles()
    expect(energySnapshots.length).toBeGreaterThanOrEqual(2)
    expect(energySnapshots.every(values => values.count === 7 && values.mode === "ready")).toBe(true)
    expect(matrixState()).toBe("ready")
    const stateChanges = emitted.flatMap(message => message.parts).filter(part => part.part === "photon" && part.path === Number(locator.ref.slice(5)))
    expect(stateChanges.map(part => part.value)).toEqual(["ready"])
    // Если ordinary Field был бы применён первым, Matrix вошла бы в terminal partial.
    expect(stateChanges.some(part => part.value === "partial")).toBe(false)
    await commit(request([{field: "other", value: 8, expectedValue: 6}, {field: "items", value: [1, 2], expectedValue: []}]), "higgs")
    const current = await root()
    expect(current.values).toMatchObject({count: 7, other: 8, mode: "ready", items: [1, 2]})
    const rootFields = await boundary.projection.sql<Array<{id: number; key: string}>>`SELECT id, key FROM field WHERE wimp = ${rootAddress}`
    const matrixFields = readMatrixProcessFields(Number(locator.ref.slice(5)))
    expect(Object.fromEntries(rootFields.map(field => [field.key, matrixFields[String(field.id)]]))).toEqual({count: 7, other: 8, mode: "ready", items: [1, 2]})
    const children = current.children?.flatMap(node => node.kind === "topology" ? node.children ?? [] : [node]) ?? []
    expect(children).toHaveLength(3)
    const child = children.find(node => node.kind === "atom" && node.meta === childAddress)!
    if (child.kind !== "atom") throw new Error("Fixture child Atom absent")
    const childLocator = {root: rootAddress, ref: child.ref, meta: childAddress}
    const beforeEntangled = history.status().sequence
    const requiredAlias = await service.applyFieldsValue(request([{field: "left", value: null, expectedValue: 7}], childLocator)).catch(error => error)
    expect(requiredAlias.data.reason).toBe("entangled_conflict")
    expect(history.status().sequence).toBe(beforeEntangled)
    await commit(request([{field: "left", value: 9, expectedValue: 7}, {field: "right", value: 8, expectedValue: 8}], childLocator), "gluon")
    expect((await root()).values.count).toBe(9)
    const beforeInvalid = history.status().sequence
    await expect(service.applyFieldsValue(request([{field: "items", value: [1, Number.NaN], expectedValue: [1, 2]}]))).rejects.toThrow("invalid_field_value")
    expect(history.status().sequence).toBe(beforeInvalid)
    const beforeInvalidPhotons = emitted.length
    const stale = request([{field: "count", value: 90, expectedValue: 9}, {field: "other", value: 80, expectedValue: 8}])
    stale.expectedFrontier.throughSequence--
    const staleResult = await service.applyFieldsValue(stale).catch(error => error)
    expect(staleResult.data.reason).toBe("frontier_mismatch")
    expect(history.status().sequence).toBe(beforeInvalid)
    const declared = await boundary.projection.sql<Array<{id: number; key: string}>>`SELECT id, key FROM field WHERE wimp = ${rootAddress}`
    const countId = String(declared.find(field => field.key === "count")!.id)
    const otherId = String(declared.find(field => field.key === "other")!.id)
    await expect(boundary.materialize({parts: [{part: "gluon", op: "replace", path: Number(locator.ref.slice(5)), ts: 1,
      value: {kind: "field-values/v1", fields: {[countId]: 90, [otherId]: 80}, expectedFields: {[countId]: 9, [otherId]: 0}}}]})).rejects.toThrow("transaction conflict")
    expect((await root()).values).toMatchObject({count: 9, other: 8})
    expect(history.status().sequence).toBe(beforeInvalid)
    expect(incoming).toHaveLength(0)
    expect(emitted).toHaveLength(beforeInvalidPhotons)
    await expect(boundary.materialize({parts: [{part: "higgs", op: "replace", path: Number(locator.ref.slice(5)), ts: 1, value: {fields: {1: "ready"}}}]})).rejects.toThrow("only by a committed Process")
  } finally {
    await energy?.close()
    weak$.dispose()
    if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
    else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
    await boundary.close()
    await rm(directory, {recursive: true, force: true})
  }
})
