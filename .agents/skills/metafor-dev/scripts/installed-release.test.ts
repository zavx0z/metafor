import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph} from "../../../../tech/release/installed"
import {configuredInstalledReleaseArtifacts} from "./installed-release"

test("dispatcher resolves only configured/active verified installed server artifacts without changing selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "metafor-dispatcher-installed-"))
  const cosmos = new URL("../../../../cosmos", import.meta.url).pathname
  const store = createInstalledReleaseStore({root})
  const prepare = async (version: string) => {
    const bytes = Buffer.from(`export const version=${JSON.stringify(version)}\n`)
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{name: "@cosmos/release", version, dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [
      {artifact: ".", kind: "entry-point", type: "text/javascript", sha256, size: bytes.length, load: "eager"},
    ]}]}]})
    return await store.prepare(graph, {async read() {return bytes}})
  }
  try {
    expect(await configuredInstalledReleaseArtifacts(cosmos, {})).toEqual([])
    const old = await prepare("0.2.0")
    const current = await prepare("0.2.1")
    await store.commitActive(current.digest)
    const before = await Bun.file(join(root, "active.json")).text()
    const paths = await configuredInstalledReleaseArtifacts(cosmos, {COSMOS_RELEASE_STORE: root, COSMOS_RELEASE_DIGEST: old.digest, COSMOS_CONTROL_TOKEN: "fixture-secret-must-not-escape"})
    expect(paths).toHaveLength(2)
    expect(paths[0]).toContain(`/candidates/${current.digest}/packages/%40cosmos%2Frelease/dist/versions/0.2.1/server.js`)
    expect(paths[1]).toContain(`/candidates/${old.digest}/packages/%40cosmos%2Frelease/dist/versions/0.2.0/server.js`)
    expect(paths.join("\n")).not.toContain("fixture-secret")
    expect(await Bun.file(join(root, "active.json")).text()).toBe(before)
    await Bun.write(paths[0]!, "corrupt")
    await expect(configuredInstalledReleaseArtifacts(cosmos, {COSMOS_RELEASE_STORE: root})).rejects.toThrow()
  } finally {await rm(root, {recursive: true, force: true})}
})

test("dispatcher lookup never creates a missing configured store or follows a root symlink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-dispatcher-missing-"))
  const cosmos = new URL("../../../../cosmos", import.meta.url).pathname
  const missing = join(directory, "missing")
  try {
    await expect(configuredInstalledReleaseArtifacts(cosmos, {COSMOS_RELEASE_STORE: missing})).rejects.toThrow()
    expect(await Bun.file(missing).exists()).toBeFalse()
    await symlink(directory, join(directory, "alias"))
    await expect(configuredInstalledReleaseArtifacts(cosmos, {COSMOS_RELEASE_STORE: join(directory, "alias")})).rejects.toThrow("real directory")
  } finally {await rm(directory, {recursive: true, force: true})}
})
