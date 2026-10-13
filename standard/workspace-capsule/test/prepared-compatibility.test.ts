import {expect, test} from "bun:test"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"
import {prepareMetaPackage} from "../../../tech/build"
import {evaluateMetaSource} from "../../../quantum/dark/load"
import {planPreparedDeclarations} from "../../../quantum/dark/prepared-declarations"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {LoadedMetaDeclaration} from "../../../quantum/dark/graph/declaration"

const shipmentPath = Bun.env.CAPSULE_BASELINE_SHIPMENT
const inertMeta = (source: string): MetaDSL => {
  const text = source.replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*(?:\r?\n)?\s*$/u, "").trim()
  if (!text.startsWith("export default ")) throw new Error("Expected a real prepared inert Meta artifact")
  return JSON.parse(text.slice("export default ".length).replace(/;\s*$/u, "")) as MetaDSL
}

test.skipIf(!shipmentPath)("real prepared Capsule declarations retain baseline Field, State and Process identities before activation", async () => {
  const shipment = JSON.parse(await readFile(shipmentPath!, "utf8")) as {digest: string; storeRoot: string; metaArtifacts: Record<string, {directory: string; entry: string}>}
  const owner = resolve(import.meta.dir, "..")
  const capsule = dirname(Bun.resolveSync("capsule/meta", owner))
  const runtime = dirname(Bun.resolveSync("@capsule/runtime/meta", capsule))
  const versions = [
    {name: "workspace-capsule", root: owner, version: "0.1.9", states: ["reconfiguring", "waiting-reconfiguration"]},
    {name: "capsule", root: capsule, version: "0.1.6", states: []},
    {name: "@capsule/runtime", root: runtime, version: "0.1.6", states: ["reconfiguring"]},
  ]
  const directory = await mkdtemp(join(tmpdir(), "capsule-prepared-compatibility-"))
  try {
    const declarations: Array<{address: NonNullable<ReturnType<typeof parseMetaAddress>>; meta: MetaDSL}> = []
    const prepared: LoadedMetaDeclaration[] = []
    const evidence: unknown[] = []
    for (const selected of versions) {
      const mapping = shipment.metaArtifacts[selected.name]!
      const baselinePath = join(shipment.storeRoot, mapping.directory.replace(/^release\//u, ""), mapping.entry)
      const baselineSource = await readFile(baselinePath, "utf8")
      const baseline = inertMeta(baselineSource)
      const build = await prepareMetaPackage({root: selected.root, address: selected.name, version: selected.version, outdir: join(directory, encodeURIComponent(selected.name)),
        readDeclaration: async sourcePath => evaluateMetaSource(await readFile(sourcePath, "utf8"), {sourcePath})})
      if (!build.result.success) throw new Error(`${selected.name}: ${build.result.stage}\n${build.result.stderr}\n${build.result.stdout}`)
      const output = build.result.outputs.find(output => output.artifact === build.metaArtifact)
      if (!output) throw new Error("Prepared declaration output is missing")
      const next = inertMeta(await readFile(output.path, "utf8"))
      const beforeStates = baseline.superposition.map(state => state.name)
      const afterStates = next.superposition.map(state => state.name)
      const beforeProcesses = (baseline.processes ?? []).map(process => [process.key, process.declaration.type])
      const afterProcesses = (next.processes ?? []).map(process => [process.key, process.declaration.type])
      expect(afterStates.slice(0, beforeStates.length)).toEqual(beforeStates)
      expect(afterStates.slice(beforeStates.length)).toEqual(selected.states)
      expect(afterProcesses.slice(0, beforeProcesses.length)).toEqual(beforeProcesses)
      expect(next.fields.slice(0, baseline.fields.length)).toEqual([...baseline.fields])
      const address = parseMetaAddress(selected.name)!
      declarations.push({address, meta: baseline})
      prepared.push({address, dsl: next, references: []})
      evidence.push({name: selected.name, version: selected.version, baselinePath,
        baselineSha256: new Bun.CryptoHasher("sha256").update(baselineSource).digest("hex"), preparedSha256: output.sha256,
        sourceRevision: build.sourceRevision, beforeStates, afterStates, beforeProcesses, afterProcesses,
        fieldsBefore: baseline.fields.map(field => field.key), fieldsAfter: next.fields.map(field => field.key)})
    }
    const canonical = {root: parseMetaAddress("workspace-capsule")!, declarations}
    // Реальный activation preflight: вычисление proposal без единого accept/effect.
    const particles = planPreparedDeclarations(canonical, prepared)
    expect(particles.length).toBeGreaterThan(0)
    const reordered = structuredClone(prepared)
    const states = reordered[0]!.dsl.superposition
    reordered[0]!.dsl = {...reordered[0]!.dsl, superposition: [states[1]!, states[0]!, ...states.slice(2)]}
    expect(() => planPreparedDeclarations(canonical, reordered)).toThrow("States must retain all existing local identities and order")
    const reorderedProcesses = structuredClone(prepared)
    const processes = reorderedProcesses[2]!.dsl.processes!
    reorderedProcesses[2]!.dsl = {...reorderedProcesses[2]!.dsl, processes: [processes[1]!, processes[0]!, ...processes.slice(2)]}
    expect(() => planPreparedDeclarations(canonical, reorderedProcesses)).toThrow("Processes must retain all existing local identities and order")
    if (Bun.env.CAPSULE_PREPARED_COMPATIBILITY_PROOF) await writeFile(Bun.env.CAPSULE_PREPARED_COMPATIBILITY_PROOF,
      JSON.stringify({schema: "metafor/capsule-prepared-compatibility/v1", baselineDigest: shipment.digest, activationPerformed: false, plannedParticles: particles.length, declarations: evidence}, null, 2), {mode: 0o600})
  } finally {await rm(directory, {recursive: true, force: true})}
}, 120_000)
