import {expect, test} from "bun:test"
import {mkdtemp, readdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

test("standalone bundled Dark authoring services remain inert without Oxc native bindings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-authoring-load-"))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    const entry = join(directory, "entry.ts")
    const executable = join(directory, "authoring.mjs")
    const source = `
      import {MetaCreateService} from ${JSON.stringify(resolve(import.meta.dir, "create.ts"))}
      import {MatterAuthoringService} from ${JSON.stringify(resolve(import.meta.dir, "matter.ts"))}
      import {DeclarationAuthoringService} from ${JSON.stringify(resolve(import.meta.dir, "declaration.ts"))}
      import {MetaAuthoringRegistry} from ${JSON.stringify(resolve(import.meta.dir, "registry.ts"))}
      import {evaluateMetaSource} from ${JSON.stringify(resolve(import.meta.dir, "../load.ts"))}
      const history = {findAuthoring() {throw new Error('Denied call reached history')}}
      const force = {async acceptAuthoringParticle() {throw new Error('Denied call reached Force')}}
      const denied = async (work) => {
        try {await work; throw new Error('Denied call was accepted')}
        catch (error) {if (!error.message.includes('capability_denied')) throw error}
      }
      const address = 'example/authoring'
      const revisions = [{address, revision: 'sha256:' + 'a'.repeat(64)}]
      await denied(new MetaCreateService(() => [], process.cwd()).create({
        contractVersion: 1, operationId: 'denied-create', capability: 'meta.create',
        address, name: 'Inert', description: '', profile: 'empty', target: 'absent',
      }, 'untrusted'))
      await denied(new MatterAuthoringService(history, force, () => []).apply({
        contractVersion: 1, operationId: 'denied-matter', capability: 'meta.matter.write', operation: 'add',
        particle: {kind: 'wimp', src: 'example/child'},
        to: {address, parent: null, edgeSlot: 'root', position: 0}, revisions,
      }, 'untrusted'))
      await denied(new DeclarationAuthoringService(history, force, () => []).apply({
        contractVersion: 1, operationId: 'denied-declaration', capability: 'meta.declaration.write',
        operation: 'add', entity: 'state', address, state: {name: 'ready', transitions: null}, revisions,
      }, 'untrusted'))
      const registry = new MetaAuthoringRegistry([])
      if (registry.readCapabilities({contractVersion: 1}, 'untrusted').capabilities.length) throw new Error('Unexpected grant')
      await denied(registry.readSourceRevisions({contractVersion: 1, capability: 'meta.source.read', addresses: [address]}, 'untrusted'))
      const meta = await evaluateMetaSource('export default MetaFor("Standalone").fields((field) => ({count: field.number.optional(0)})).superposition({ready: {}}).mass(() => ({})).energy().processes(() => []).reactions(() => []).matter(({html}) => html\`\`).bulk()')
      if (meta.name !== 'Standalone' || meta.fields[0]?.key !== 'count') throw new Error('Basic declaration evaluation failed')
      console.log('standalone-ready')
    `
    await Bun.write(entry, source)
    const build = await Bun.build({entrypoints: [entry], target: "bun", conditions: ["cosmos:server", "internal:server"]})
    expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
    expect(build.outputs).toHaveLength(1)
    await Bun.write(executable, build.outputs[0]!)
    await rm(entry)
    expect(await readdir(directory)).toEqual(["authoring.mjs"])
    child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory,
      env: {...process.env, METAFOR_META_SOURCE_ROOT: directory, METAFOR_META_ARTIFACT_ROOT: undefined,
        METAFOR_META_ARTIFACT_MAP: undefined, METAFOR_META_ARTIFACT_MAP_FILE: undefined},
      stdout: "pipe", stderr: "pipe"})
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream))
      throw new Error("Standalone authoring fixture requires output pipes")
    const stdout = new Response(child.stdout).text()
    const stderr = new Response(child.stderr).text()
    const code = await child.exited
    expect(await stderr).toBe("")
    expect(code).toBe(0)
    expect(await stdout).toBe("standalone-ready\n")
  } finally {
    if (child?.exitCode === null) {child.kill("SIGKILL"); await child.exited}
    await rm(directory, {recursive: true, force: true})
  }
}, 15_000)
