import {expect, test} from "bun:test"
import {mkdtemp, mkdir, realpath, rm, writeFile, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createDevelopmentCatalog} from "../server/development-catalog"
import {createDevelopmentContent} from "../server/development-content"
import {createDevelopmentSources} from "../server/development-source"
import {configuredDevelopment} from "../server/development"

test("реальная вложенность packages отделена от dependencies; content и media остаются у своего владельца", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cosmos-catalog-")))
  try {
    const source = join(root, "source"), parent = join(source, "packages", "group"), leaf = join(parent, "parts", "leaf")
    await mkdir(join(leaf, "contract"), {recursive: true})
    await mkdir(join(leaf, "spec"))
    await writeFile(join(source, "package.json"), JSON.stringify({name: "@fixture/root", workspaces: ["packages/*", "packages/*/parts/*"], dependencies: {external: "*"}}))
    await writeFile(join(parent, "package.json"), JSON.stringify({name: "@fixture/group", devDependencies: {dev: "*"}}))
    await writeFile(join(leaf, "package.json"), JSON.stringify({name: "@fixture/leaf", label: "Лист", description: "Обычный пакет",
      exports: {".": {node: "./server.ts"}}, peerDependencies: {peer: "*"}, optionalDependencies: {optional: "*"}}))
    await writeFile(join(leaf, "server.ts"), "/** Обзор по исходному TSDoc.\n @packageDocumentation */\nthrow new Error('must not execute')\n")
    await writeFile(join(leaf, "contract/index.ts"), "export type Input = {value: string}\n")
    await writeFile(join(leaf, "spec/scenario.spec.ts"), "throw new Error('scenario must not execute')\n")
    await writeFile(join(leaf, "diagram.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const assignment = {id: "catalog", rootPackage: "@fixture/root", roots: [{name: "@fixture/root", directory: source, writable: true}], stateDirectory: join(root, "state")}
    const catalog = await createDevelopmentCatalog(assignment)
    expect(catalog.snapshot.packages.find(item => item.name === "@fixture/leaf")).toMatchObject({owner: "@fixture/root", ownerName: "@fixture/group"})
    expect(catalog.snapshot.packages.find(item => item.name === "@fixture/group")).toMatchObject({ownerName: "@fixture/root"})
    expect(catalog.snapshot.packages.find(item => item.name === "external")).toMatchObject({resolution: "external", writable: false})
    expect(new Set(catalog.snapshot.dependencies.map(edge => edge.kind))).toEqual(new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]))
    const entry = catalog.snapshot.nodes!.find(node => node.kind === "entry" && node.packageName === "@fixture/leaf")!
    const content = createDevelopmentContent(catalog)
    const page = await content("@fixture/leaf", entry.id)
    expect(page.documentation?.markdown).toContain("Обзор по исходному TSDoc")
    expect(page.contracts[0]?.content).toBe("export type Input = {value: string}\n")
    expect((await content("@fixture/leaf")).scenarios).toMatchObject({sourcePaths: ["spec/scenario.spec.ts"], executable: false})
    expect(JSON.stringify({catalog: catalog.snapshot, page})).not.toContain(root)
    await expect(content("external")).rejects.toThrow("outside")
    await expect(content("@fixture/group", entry.id)).rejects.toThrow("outside")
    const files = createDevelopmentSources(catalog)
    expect(await files.resource("@fixture/leaf", "diagram.svg").text()).toContain("<svg")
    expect(() => files.resource("@fixture/leaf", "server.ts")).toThrow()
    await symlink(join(leaf, "diagram.svg"), join(leaf, "linked.svg"))
    expect(() => files.resource("@fixture/leaf", "linked.svg")).toThrow()
    expect(() => files.resource("@fixture/leaf", "../diagram.svg")).toThrow()

    // SDK включён в immutable bytes; на запуске доступны только явно назначенные source inputs.
    const buildRoot = join(root, "build"), installed = join(root, "installed")
    await mkdir(buildRoot); await mkdir(installed)
    const input = join(buildRoot, "entry.ts")
    await writeFile(input, `import {createDevelopmentCatalog} from ${JSON.stringify(resolve(import.meta.dir, "../server/development-catalog.ts"))}
import {createDevelopmentContent} from ${JSON.stringify(resolve(import.meta.dir, "../server/development-content.ts"))}
const catalog = await createDevelopmentCatalog(JSON.parse(process.argv[2]))
const entry = catalog.snapshot.nodes.find(node => node.kind === "entry" && node.packageName === "@fixture/leaf")
const page = await createDevelopmentContent(catalog)("@fixture/leaf", entry.id)
console.log(JSON.stringify({parent: catalog.source("@fixture/leaf").ownerName, doc: page.documentation.markdown, contracts: page.contracts.length}))`)
    const build = await Bun.build({entrypoints: [input], target: "bun", packages: "bundle"})
    expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
    expect(build.outputs).toHaveLength(1)
    const artifact = join(installed, "catalog.mjs")
    await Bun.write(artifact, build.outputs[0]!)
    await rm(buildRoot, {recursive: true})
    const child = Bun.spawn([process.execPath, artifact, JSON.stringify(assignment)], {cwd: installed, env: {PATH: ""}, stdout: "pipe", stderr: "pipe"})
    const [code, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code, error).toBe(0)
    expect(JSON.parse(out)).toMatchObject({parent: "@fixture/group", contracts: 1})
  } finally {await rm(root, {recursive: true, force: true})}
}, 15000)

test("content HTTP читает текущий узел по reader capability, media сохраняет same-origin и filesystem ownership", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cosmos-content-http-")))
  let service: Awaited<ReturnType<typeof configuredDevelopment>> | undefined
  try {
    const source = join(root, "source")
    await mkdir(source)
    await writeFile(join(source, "package.json"), JSON.stringify({name: "@fixture/content", exports: "./index.ts"}))
    await writeFile(join(source, "index.ts"), "/** Первое описание.\n @packageDocumentation */\nexport const value = 1\n")
    await writeFile(join(source, "image.svg"), "<svg/>")
    const config = join(root, "assignment.json")
    await writeFile(config, JSON.stringify({version: 1, id: "http", rootPackage: "@fixture/content", roots: [{name: "@fixture/content", directory: source, writable: false}],
      stateDirectory: join(root, "state"), execution: {connectionId: "test", connections: [{id: "test", label: "Fixture", enabled: true,
        provider: "codex", peer: {peerId: "fixture", executorId: "fixture"}}]}}), {mode: 0o600})
    service = await configuredDevelopment({COSMOS_DEVELOPMENT_CONFIG: config}, null)
    const origin = "http://127.0.0.1:4444", prefix = `${origin}/cosmos/development`
    const host = {requestIP: () => ({address: "127.0.0.1"})}
    const post = (path: string, body: object, token?: string) => service!.fetch(new Request(`${prefix}/${path}`, {method: "POST",
      headers: {origin, "content-type": "application/json", ...(token ? {"x-storybook-session": token} : {})}, body: JSON.stringify(body)}), host)
    expect((await post("content", {packageName: "@fixture/content"})).status).toBe(401)
    const {readerToken} = await post("reader", {}).then(response => response.json())
    const first = await post("content", {packageName: "@fixture/content"}, readerToken).then(response => response.json())
    expect(first.documentation.markdown).toContain("Первое описание")
    await writeFile(join(source, "index.ts"), "/** Новое описание.\n @packageDocumentation */\nexport const value = 2\n")
    const next = await post("content", {packageName: "@fixture/content"}, readerToken).then(response => response.json())
    expect(next.documentation.markdown).toContain("Новое описание")
    expect(next.revision).not.toBe(first.revision)
    const image = await service!.fetch(new Request(new URL("image.svg", origin + next.resourceBase)), host)
    expect(image.headers.get("content-type")).toBe("image/svg+xml")
    expect(await image.text()).toBe("<svg/>")
    const foreign = await service!.fetch(new Request(new URL("image.svg", origin + next.resourceBase), {headers: {origin: "https://foreign.example", "sec-fetch-site": "cross-site"}}), host)
    expect(foreign.status).toBe(403)
    expect((await post("content", {packageName: "@fixture/content", nodeId: "package:foreign"}, readerToken)).status).not.toBe(200)
  } finally {await service?.close(); await rm(root, {recursive: true, force: true})}
})
