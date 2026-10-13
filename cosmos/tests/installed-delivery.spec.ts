import {expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, realpath, rm, readdir} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {brotliDecompressSync} from "node:zlib"
import {
  createInstalledReleaseStore,
  validatePublishedReleaseGraph,
  type InstalledArtifactIdentity,
  type PublishedReleaseOutput,
} from "@metafor/tech-release/installed"
import {
  browserPackageArtifactUrl,
  verifyPackageArtifactResponse,
  type BrowserPackageEnvironment,
} from "@metafor/tech-build/identity"
import {createInstalledReleaseDelivery} from "../release/server/installed/delivery"
import {browserPackageSourceMapUrl} from "../release/server/http/source-map"

const origin = "https://installed-release.test"
const name = "@fixture/release"

function fixture(version = "1.0.0") {
  const bodies = new Map<string, Uint8Array>()
  const output = (artifact: PublishedReleaseOutput["artifact"], text: string, kind: PublishedReleaseOutput["kind"] = "entry-point", load: "eager" | "lazy" = "lazy", sourceMapFor?: PublishedReleaseOutput["artifact"]): PublishedReleaseOutput => {
    const bytes = Buffer.from(text)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    bodies.set(sha256, bytes)
    const type = kind === "sourcemap" ? "application/json" : artifact.endsWith(".css") ? "text/css" : "text/javascript"
    return {artifact, kind, load, type, sha256, size: bytes.length, ...(sourceMapFor === undefined ? {} : {sourceMapFor})}
  }
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{name, version, dependencies: {}, environments: [
    {env: "main", publicArtifacts: {"./editor": ".js", "./theme.css": ".css"}, outputs: [
      output(".", `export const main='${version}'`, "entry-point", "eager"),
      output("./editor", `export const editor='${version}'`),
      output("./theme.css", `:root{--version:'${version}'}`, "copy", "eager"),
      output("./.cosmos/chunk/shared.js", `export const shared='${version}'`, "chunk", "eager"),
      output("./.cosmos/chunk/lazy.js", `export const lazy='${version}'`, "chunk"),
      output("./.cosmos/map/main.js.map", '{"version":3,"sources":["main.ts"]}', "sourcemap", "eager", "."),
      output("./.cosmos/chunk/shared.js.map", '{"version":3,"sources":["shared.ts"]}', "sourcemap", "eager", "./.cosmos/chunk/shared.js"),
    ]},
    ...["service", "worker", "server", "server-worker"].map(env => ({env, publicArtifacts: {}, outputs: [output(".", `export const ${env.replace("-", "_")}='${version}'`, "entry-point", "eager")]})),
  ]}]})
  const source = {async read(identity: InstalledArtifactIdentity) {
    const bytes = bodies.get(identity.sha256)
    if (!bytes) throw new Error("Fixture source does not have artifact")
    return bytes
  }}
  return {graph, source, bodies}
}

async function withStore(work: (store: ReturnType<typeof createInstalledReleaseStore>, root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "installed-delivery-")))
  try {await work(createInstalledReleaseStore({root}), root)} finally {await rm(root, {recursive: true, force: true})}
}

const request = (path: string, init?: RequestInit) => new Request(`${origin}${path}`, init)

test("готовый установленный граф сохраняет browser /code и roots/eager projection без source checkout", async () => withStore(async (store, root) => {
  const value = fixture()
  const candidate = await store.prepare(value.graph, value.source)
  const delivery = await createInstalledReleaseDelivery({store, digest: candidate.digest})
  expect(delivery.graph.packages[0]!.environments).toHaveLength(5)
  const state = await delivery.fetch(request("/code"))
  expect(state.headers.get("Cache-Control")).toBe("no-cache")
  const body = await state.json()
  expect(body.packages.map((identity: {env: string}) => identity.env).sort()).toEqual(["main", "service", "worker"])
  expect(body.packages).toEqual(delivery.releasedBrowserRoots())
  const desired = delivery.desiredBrowserArtifacts()
  expect(desired).toHaveLength(5)
  expect(desired.some(identity => identity.artifact === "./theme.css")).toBe(true)
  expect(desired.some(identity => identity.artifact === "./.cosmos/chunk/shared.js")).toBe(true)
  expect(desired.some(identity => identity.artifact === "./editor")).toBe(false)
  expect(desired.some(identity => identity.artifact?.endsWith(".map"))).toBe(false)
  expect(await readdir(root)).not.toContain("package.json")
  expect(await readdir(root)).not.toContain("node_modules")
}))

test("installed startup remains HTTP-deliverable and listed but never enters release update desired", async () => withStore(async store => {
  const value = fixture()
  const base = value.graph.packages[0]!
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [...value.graph.packages,
    {...base, name: "@cosmos/startup", environments: base.environments.filter(part => part.env === "main" || part.env === "service")},
  ]})
  const candidate = await store.prepare(graph, value.source)
  const delivery = await createInstalledReleaseDelivery({store, digest: candidate.digest})
  expect(delivery.desiredBrowserArtifacts().some(identity => identity.name === "@cosmos/startup")).toBe(false)
  expect(delivery.releasedBrowserRoots().filter(identity => identity.name === "@cosmos/startup")).toHaveLength(2)
  expect((await delivery.fetch(request("/@cosmos/startup?env=main"))).status).toBe(200)
}))

test("stable/exact root, public и generated URLs отдают прежние identity headers и точные bytes", async () => withStore(async store => {
  const value = fixture()
  const candidate = await store.prepare(value.graph, value.source)
  const delivery = await createInstalledReleaseDelivery({store, digest: candidate.digest})
  for (const env of ["main", "service", "worker"] as const) {
    const part = value.graph.packages[0]!.environments.find(part => part.env === env)!
    for (const output of part.outputs.filter(output => output.kind !== "sourcemap")) {
      const identity = {name, env, version: "1.0.0", sha256: output.sha256, size: output.size, ...(output.artifact === "." ? {} : {artifact: output.artifact})}
      const exact = await delivery.fetch(request(browserPackageArtifactUrl(name, env, output.artifact, "1.0.0")))
      expect(exact.status).toBe(200)
      await verifyPackageArtifactResponse(exact, identity)
      expect(exact.headers.get("Cache-Control")).toBe("no-cache")
      expect(exact.headers.get("Vary")).toBe("Accept-Encoding")
      if (!output.artifact.startsWith("./.cosmos/")) {
        const stable = await delivery.fetch(request(browserPackageArtifactUrl(name, env, output.artifact)))
        await verifyPackageArtifactResponse(stable, identity)
      }
      expect(exact.headers.get("Service-Worker-Allowed")).toBe(env === "service" ? "/" : null)
      expect(exact.headers.get("Content-Security-Policy")).toBe(env === "service" ? "script-src 'unsafe-eval'" : null)
    }
  }
}))

test("source maps остаются отдельным network ответом, Brotli сохраняет decoded identity", async () => withStore(async store => {
  const value = fixture()
  const candidate = await store.prepare(value.graph, value.source)
  const delivery = await createInstalledReleaseDelivery({store, digest: candidate.digest})
  const root = await delivery.fetch(request(browserPackageArtifactUrl(name, "main", ".", "1.0.0"), {headers: {"Accept-Encoding": "gzip, br"}}))
  expect(root.headers.get("Content-Encoding")).toBe("br")
  const compressed = await root.arrayBuffer()
  const decoded = brotliDecompressSync(compressed)
  expect(decoded.toString()).toBe("export const main='1.0.0'")
  expect(root.headers.get("X-Package-Size")).toBe(String(decoded.byteLength))
  expect(root.headers.get("Content-Length")).toBe(String(compressed.byteLength))
  const mapUrl = browserPackageSourceMapUrl(name, "main", "1.0.0")
  expect(root.headers.get("SourceMap")).toBe(mapUrl)
  const map = await delivery.fetch(request(mapUrl))
  expect(await map.json()).toEqual({version: 3, sources: ["main.ts"]})
  expect(map.headers.get("X-Package-Name")).toBeNull()
  expect(map.headers.get("SourceMap")).toBeNull()
  const generated = await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "./.cosmos/chunk/shared.js", "1.0.0")))
  expect(generated.headers.get("SourceMap")).toBe(browserPackageSourceMapUrl(name, "main", "1.0.0", "./.cosmos/chunk/shared.js"))
  const generatedMap = await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "./.cosmos/chunk/shared.js.map", "1.0.0")))
  expect(generatedMap.status).toBe(200)
  expect(generatedMap.headers.get("X-Package-Artifact")).toBeNull()
  const raw = await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "."), {headers: {"Accept-Encoding": "br;q=0,*;q=1"}}))
  expect(raw.headers.get("Content-Encoding")).toBeNull()
}))

test("старые exact lazy запросы сохраняются после выбора нового server, stable остаётся выбранным", async () => withStore(async store => {
  const old = fixture()
  const next = fixture("1.0.1")
  const previous = await store.prepare(old.graph, old.source)
  const selected = await store.prepare(next.graph, next.source)
  await store.commitActive(selected.digest)
  const delivery = await createInstalledReleaseDelivery({store, digest: selected.digest})
  expect(await (await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "./editor", "1.0.0")))).text()).toBe("export const editor='1.0.0'")
  expect(await (await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "./.cosmos/chunk/lazy.js", "1.0.0")))).text()).toBe("export const lazy='1.0.0'")
  expect(await (await delivery.fetch(request(browserPackageArtifactUrl(name, "main", "./editor")))).text()).toBe("export const editor='1.0.1'")
  expect((await store.readCandidate(previous.digest))?.digest).toBe(previous.digest)
  expect(delivery.releasedBrowserRoots().every(identity => identity.version === "1.0.1")).toBe(true)
}))

test("неподдержанные методы, versions, environments и некорректные URLs не запускают fallback", async () => withStore(async store => {
  const value = fixture()
  const candidate = await store.prepare(value.graph, value.source)
  const delivery = await createInstalledReleaseDelivery({store, digest: candidate.digest})
  for (const path of ["/code?version=1.0.0", "/unknown", `/${name}?env=server`, `/${name}?version=1.0.0&env=main`, `/${name}?env=main&version=9.0.0`, `/${name}/missing?env=main`, `/${name}/%2e%2e/private?env=main`, `/${name}?env=main&other=1`])
    expect((await delivery.fetch(request(path))).status).toBe(404)
  const refused = await delivery.fetch(request("/code", {method: "POST"}))
  expect(refused.status).toBe(405)
  expect(refused.headers.get("Allow")).toBe("GET")
  const part = value.graph.packages[0]!.environments.find(part => part.env === "main")!
  const root = part.outputs.find(output => output.artifact === ".")!
  const identity: InstalledArtifactIdentity = {name, version: "1.0.0", env: "main" as BrowserPackageEnvironment, artifact: ".", sha256: root.sha256, size: root.size}
  const path = await store.artifactPath(candidate.digest, identity)
  await Bun.write(path, new Uint8Array(root.size))
  await expect(delivery.fetch(request(browserPackageArtifactUrl(name, "main", ".")))).rejects.toThrow("corrupt")
}))
