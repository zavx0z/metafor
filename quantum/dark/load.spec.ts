import {describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {createMetaSourceResolver} from "shared/metafor/source"

import {canonicalMetaSource, evaluateMetaSource, loadMeta, resolveMetaAuthoringPath, resolveMetaPath} from "./load.ts"

describe("Dark Meta source addressing", () => {
  test("accepts exact scoped or unscoped package names", () => {
    expect(canonicalMetaSource("@zavx0z/capsule")).toBe(true)
    expect(canonicalMetaSource("@zavx0z/capsule-profile")).toBe(true)

    expect(canonicalMetaSource("capsule")).toBe(true)
    expect(canonicalMetaSource("zavx0z/capsule/profile")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/profile/nested")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/../profile")).toBe(false)
    expect(canonicalMetaSource("/zavx0z/capsule/profile")).toBe(false)
  })

  test("resolves canonical src through an explicitly supplied installed root", () => {
    const root = resolve(import.meta.dir, "fixtures", "installed")
    const resolver = createMetaSourceResolver({root, installed: true})
    expect(resolveMetaPath("@zavx0z/capsule", resolver)).toBe(resolve(root, "@zavx0z/capsule/meta.ts"))
  })

  test("loads installed entry and its compiled relative chunks with no source checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-installed-meta-"))
    try {
      await writeFile(join(root, "chunk.js"), "export const name = 'cached-release'\n")
      await writeFile(join(root, "server.js"), "import {name} from './chunk.js'; export default {name}\n")
      const resolver = createMetaSourceResolver({root, artifacts: {"owner/repository": {directory: ".", entry: "server.js"}}})
      expect((await loadMeta("owner/repository", resolver)).name).toBe("cached-release")
    } finally { await rm(root, {recursive: true, force: true}) }
  })

  test("rejects installed artifact paths as authoring targets", () => {
    const resolver = createMetaSourceResolver({root: "/tmp/installed", installed: true})
    expect(() => resolveMetaAuthoringPath("@zavx0z/capsule", resolver)).toThrow("source preparation root")
  })

  test("rejects noncanonical sources before filesystem access", () => {
    expect(() => resolveMetaPath("../capsule")).toThrow(
      "Ожидается имя package.json#name",
    )
    expect(() => resolveMetaPath("zavx0z/capsule/profile")).toThrow(
      "Ожидается имя package.json#name",
    )
  })

  test("evaluates identical source bytes as a fresh module on every read", async () => {
    const key = "__metaforFreshDeclarationRead"
    const global = globalThis as typeof globalThis & {[key: string]: number | undefined}
    const source = `
      globalThis.${key} = (globalThis.${key} ?? 0) + 1
      export default {name: String(globalThis.${key})}
    `
    try {
      expect((await evaluateMetaSource(source)).name).toBe("1")
      expect((await evaluateMetaSource(source)).name).toBe("2")
    } finally {
      delete global[key]
    }
  })

  test("provides the global MetaFor DSL to a Cluster source without an import", async () => {
    const declaration = await evaluateMetaSource(`
      export default MetaFor("cluster-global")
        .fields(() => ({}))
        .superposition({})
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter()
        .bulk()
    `)

    expect(declaration.name).toBe("cluster-global")
  })

  test("source-bound preparation resolves relative JSX components with one DSL identity and leaves action imports inert", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-static-agents-"))
    const sourcePath = join(root, "meta.ts")
    const key = "__metaforStaticAgentDeclaration"
    const global = globalThis as typeof globalThis & {[key: string]: number | undefined}
    try {
      await mkdir(join(root, "agents"))
      await writeFile(join(root, "package.json"), JSON.stringify({name: "@fixture/declarations", exports: {"./meta": "./meta.ts"}}))
      await writeFile(sourcePath, 'throw new Error("Do not evaluate disk entry instead of the supplied candidate")')
      await writeFile(join(root, "actions.ts"), 'throw new Error("Action modules are not declaration imports")\nexport default async () => "done"')
      await writeFile(join(root, "agents", "assistant.tsx"), `
        globalThis.${key} = (globalThis.${key} ?? 0) + 1
        export default function Assistant({atom,value}) {
          return <agent id="assistant" atom={atom} task={value.task} answer={value.answer} status={value.status} error={value.error}/>
        }
      `)
      await writeFile(join(root, "agents", "index.tsx"), 'import Assistant from "./assistant.tsx"\nexport default context => <Assistant {...context}/>')
      const source = `import agents from "./agents/index.tsx"
        export default MetaFor("Imported agents")
          .fields(field => ({task:field.string.optional(),answer:field.string.optional(),status:field.string.optional(),error:field.string.optional()}))
          .superposition({idle:null}).mass(()=>({})).energy()
          .processes(process => [process("idle").action(async ({value}) => {
            const action = await import("./actions.ts")
            return action.default({value})
          })]).reactions().matter().bulk().agents(agents)
      `
      for (let run = 1; run <= 2; run++) {
        const declaration = await evaluateMetaSource(source, {sourcePath})
        expect(global[key]).toBe(run)
        expect(declaration.matter?.[0]).toMatchObject({kind: "wimp", src: "@metafor/agent"})
        const process = declaration.processes?.[0]?.declaration
        if (process?.type !== "action") throw new Error("Missing declared action Process")
        expect(process.action.src).toBe("./actions.ts")
        expect(process.action.wrapperSrc).toContain('import("./actions.ts")')
        expect(JSON.stringify(declaration)).not.toContain("Assistant(")
      }
      await writeFile(sourcePath, source)
      const resolver = createMetaSourceResolver({root})
      expect((await loadMeta("@fixture/declarations", resolver)).name).toBe("Imported agents")
    } finally {delete global[key]; await rm(root, {recursive: true, force: true})}
  })
})
