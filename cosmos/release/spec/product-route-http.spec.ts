import {expect, test} from "bun:test"
import {mkdtemp, mkdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

/** Реальные source/installed listeners; infrastructure заменена только в отдельном test child. */
for (const installed of [false, true]) test(`${installed ? "installed" : "source"} HTTP serves only recognized product addresses`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-product-route-"))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    await mkdir(join(directory, "static"))
    await Bun.write(join(directory, "static/index.html"), "<html>product-shell</html>")
    const entry = join(directory, "fixture.ts")
    const services = resolve(import.meta.dir, "../server/services.ts")
    const runtime = resolve(import.meta.dir, installed ? "../server/installed/runtime.ts" : "../server/runtime.ts")
    const delivery = resolve(import.meta.dir, "../server/installed/delivery.ts")
    const control = resolve(import.meta.dir, "../server/installed/control.ts")
    const store = resolve(import.meta.dir, "../../../tech/release/installed.ts")
    await Bun.write(entry, `
import {mock} from "bun:test"
mock.module(${JSON.stringify(services)}, () => ({builder: {knownPackage: async () => null}, release: {recoverPublication: async () => {}, releasedPackages: async () => [], readDesiredBrowserArtifacts: async () => []}}))
${installed ? `
const original = await import(${JSON.stringify(store)})
mock.module(${JSON.stringify(store)}, () => ({...original, createInstalledReleaseStore: () => ({})}))
mock.module(${JSON.stringify(delivery)}, () => ({createInstalledReleaseDelivery: async () => ({
  graph: {packages: [{name: "@cosmos/release", version: "1.0.0", environments: [{env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", sha256: "a".repeat(64), size: 1}]}]}]},
  desiredBrowserArtifacts: () => [], fetch: async () => new Response(null, {status: 404}),
})}))
let lifecycle: any
mock.module(${JSON.stringify(control)}, () => ({attachServerProcessControl: async (value: any) => {lifecycle = value; await value.bind(); await value.admit(); return {requestHandover: async () => {}}}}))
const {runInstalledRelease} = await import(${JSON.stringify(runtime)})
const server = await runInstalledRelease({storeRoot: ".", digest: "b".repeat(64), port: 0, staticRoot: ${JSON.stringify(join(directory, "static"))}})
` : `
const {startReleaseServer} = await import(${JSON.stringify(runtime)})
const server = await startReleaseServer({port: 0})
`}
const origin = "http://127.0.0.1:" + server.port
try {
  const result = []
  for (const [path, method] of [["/", "GET"], ["/networks", "GET"], ["/verse/opaque-atom", "GET"], ["/verse-%CE%B1/agent%3A%CE%B1", "GET"], ["/unrecognized", "GET"], ["/a/b/c", "GET"], ["/oracle/not-a-method", "GET"], ["/agents/provider", "GET"], ["/clients/not-a-socket", "GET"], ["/networks", "POST"], ["/verse/opaque-atom", "POST"]]) {
    const response = await fetch(origin + path, {method, headers: {Accept: "text/html"}})
    result.push({path, method, status: response.status, text: await response.text()})
  }
  console.log(JSON.stringify(result))
} finally {${installed ? "await lifecycle.destroy();" : ""} await server.stop(true)}
`)
    child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", entry], {
      cwd: directory, env: {...process.env, COSMOS_ROOT: directory, COSMOS_PACKAGE_IDENTITY: JSON.stringify({name: "@cosmos/release", env: "server", version: "1.0.0", sha256: "a".repeat(64), size: 1})}, stdout: "pipe", stderr: "pipe",
    })
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) throw new Error("Fixture pipes unavailable")
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(exit, stderr).toBe(0)
    const rows = JSON.parse(stdout.trim().split("\n").at(-1)!) as {path: string; status: number; text: string}[]
    for (const row of rows.slice(0, 4)) expect(row, row.path).toMatchObject({status: 200, text: "<html>product-shell</html>"})
    for (const row of rows.slice(4)) {expect(row.status, row.path).toBe(404); expect(row.text).not.toContain("product-shell")}
  } finally {
    if (child && child.exitCode === null) {child.kill(); await child.exited}
    await rm(directory, {recursive: true, force: true})
  }
}, 10_000)
