import {expect, test} from "bun:test"
import {mkdtemp, mkdir, writeFile, copyFile, rm, realpath} from "node:fs/promises"
import {join, resolve} from "node:path"
import {tmpdir} from "node:os"

test("immutable Cosmos environment assigns knowledge and source tools without checkout runtime imports", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-development-artifact-")))
  const source = join(directory, "source"), build = join(directory, "build"), installed = join(directory, "installed")
  await Promise.all([mkdir(source), mkdir(build), mkdir(installed)])
  try {
    await writeFile(join(source, "package.json"), JSON.stringify({name: "@fixture/portable"}))
    await writeFile(join(source, "proof.ts"), "portable-source-before")
    const entry = join(build, "entry.ts")
    await writeFile(entry, `
import {createDevelopmentCatalog} from ${JSON.stringify(resolve(import.meta.dir, "../server/development-catalog.ts"))}
import {createDevelopmentEnvironment} from ${JSON.stringify(resolve(import.meta.dir, "../server/development-environment.ts"))}
const directory = process.argv[2]
const catalog = await createDevelopmentCatalog({id:"portable",rootPackage:"@fixture/portable",stateDirectory:directory,
  roots:[{name:"@fixture/portable",directory,writable:true}]})
const environment = await createDevelopmentEnvironment(catalog, {
  async instructions() {return [{source:"own-host",content:"portable-own-context"}]},
  async readKnowledge() {return Response.json({children:[]})},
}, {address:catalog.source("@fixture/portable").address,executorId:"portable-executor",executorLabel:"Fixture",
  async authorize() {}, onUpdate() {}})
const invoke = async (name, args) => JSON.parse((await environment.execute({name,arguments:args},new AbortController().signal))[0].text)
try {
  const menu = await invoke("knowledge.read",{path:"./environment/documents"})
  const document = await invoke("knowledge.read",{path:menu.result.children[0].path})
  const written = await invoke("filesystem.write",{path:"proof.ts",content:"portable-source-after"})
  const read = await invoke("filesystem.read",{path:"proof.ts"})
  process.stdout.write(JSON.stringify({context:JSON.stringify(environment.content).includes("portable-own-context"),
    registry:JSON.stringify(environment.content).includes("filesystem.read"),knowledge:document.result.content.length > 100,
    written:!written.error,read:JSON.stringify(read).includes("portable-source-after")}))
} finally {environment.dispose()}
`)
    const result = await Bun.build({entrypoints: [entry], outdir: build, target: "bun", packages: "bundle"})
    if (!result.success) throw new AggregateError(result.logs, "Cosmos portable environment did not build")
    const artifact = join(installed, "artifact.js")
    await copyFile(join(build, "entry.js"), artifact)
    await rm(build, {recursive: true, force: true})
    const child = Bun.spawn([process.execPath, artifact, source], {cwd: installed, env: {PATH: process.env.PATH ?? ""}, stdout: "pipe", stderr: "pipe"})
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code, stderr).toBe(0)
    expect(JSON.parse(stdout)).toEqual({context: true, registry: true, knowledge: true, written: true, read: true})
  } finally {await rm(directory, {recursive: true, force: true})}
}, 15000)
