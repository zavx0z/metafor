import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {parseMetaAddress, validateGraph, GRAPH_SCHEMA} from "@metafor/types/metafor/graph"
import {open} from "../../boundary/sqlite.ts"
import {readBoundaryMeta} from "../../boundary/graph/declaration.ts"
import {readBoundaryGraphProjection} from "../../boundary/graph/runtime.ts"
import {evaluateMetaSource} from "../../dark/load.ts"
import {matterParticles} from "../../dark/dark.ts"
import {normalizeMetaTemplate} from "../../dark/graph/declaration.ts"

test("canonical declarations survive source removal, live edits and Boundary restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-canonical-declaration-"))
  const root = parseMetaAddress(`test/canonical-${crypto.randomUUID()}`)!
  const child = parseMetaAddress(`${root}-child`)!
  const dsl = await evaluateMetaSource(`export default MetaFor("Original")
    .fields(field => ({mode: field.enum("a", "b").optional("a"), count: field.number.optional(0)}))
    .superposition({idle: {working: {count: {gt: 0}}}, working: {idle: {count: 0}}})
    .mass(mass => ({history: mass.json()})).energy()
    .processes(process => [process("working", {env:["server"]})
      .action(async ({value}) => { const {run} = await import("./run.ts")
        return run(value.count) })
      .success(({value, update}) => update({count: value.count + 1}))])
    .reactions(reaction => [[["idle"], reaction({key:"observe",label:"Observe"})
      .filter([{meta:${JSON.stringify(child)},states:["ready"]}])
      .equal(({value,update}) => update({count:value.count + 1}))]])
    .matter(({html}) => html\`<meta-for src="${child}" />\`).bulk()`)
  const childMeta = await evaluateMetaSource(`export default MetaFor("Child").fields(() => ({}))
    .superposition({ready:{}}).mass(() => ({})).energy().processes(() => [])
    .reactions(() => []).matter(({html}) => html\`\`).bulk()`)
  let database = await open(join(directory, "world.sqlite"))
  try {
    for await (const particle of matterParticles(root, async address => {
      if (address === root) return dsl
      if (address === child) return childMeta
      throw new Error("Unexpected source read")
    })) await database.materialize({parts: [particle]})
    await database.materialize({parts: [{part: "inflaton", op: "replace", path: "wimp", ts: 2,
      value: {src: root, name: "Working version", desc: "Saved in Boundary"}}]})
    await database.close()
    database = await open(join(directory, "world.sqlite"))
    const saved = await readBoundaryMeta(database, {root})
    expect(saved.declarations.map(item => item.address)).toEqual([root, child])
    const meta = saved.declarations[0]!.meta
    expect(meta.name).toBe("Working version")
    expect(meta.fields[0]).toMatchObject({key: "mode", values: ["a", "b"], default: "a"})
    expect(meta.superposition[0]?.transitions).toEqual({working: {count: {gt: 0}}})
    expect(meta.processes?.[0]?.declaration).toMatchObject({action: {read: ["mode", "count"]}, success: {read: ["count"], write: ["count"]}})
    expect(meta.reactions?.[0]).toMatchObject({read: ["count"], write: ["count"], states: ["idle"]})
    const runtime = await readBoundaryGraphProjection(database, {})
    const graph = {schema: GRAPH_SCHEMA, root, template: Object.fromEntries(saved.declarations.map(item =>
      [item.address, normalizeMetaTemplate(item.meta, item.address)])), runtime: runtime.runtime}
    const result = validateGraph(graph)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(JSON.stringify(saved)).not.toContain("localId")
    await expect(readBoundaryMeta(database, {root, source: "anything"})).rejects.toThrow("one canonical root")
  } finally {
    await database.close()
    await rm(directory, {recursive: true, force: true})
  }
})
