import {expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

test("test controls stay in fixtures and never enter production runtime", async () => {
  const production = await productionSources()
  for (const source of production) {
    expect(source).not.toContain("/__tests")
    expect(source).not.toContain("LOAD_TEST_")
    expect(source).not.toContain("RELEASE_FIXTURE_")
  }

  const fixtureServer = await Bun.file(join(cosmos, "tests/fixture/server.ts")).text()
  expect(fixtureServer).toContain('"/__tests/state"')
  expect(fixtureServer).toContain('"/__tests/rpc/close"')
  expect(fixtureServer).not.toContain("recoverPublication")
  expect(fixtureServer).not.toContain("packageResponse")
  expect(fixtureServer).not.toContain("releasedPackages")
})

test("release tests direct every mutation to test-owned temporary fixtures", async () => {
  const [browser, profiles, publication, release, ham005] = await Promise.all([
    Bun.file(join(cosmos, "tests/load-001.browser.spec.ts")).text(),
    Bun.file(join(cosmos, "tests/build-profiles.spec.ts")).text(),
    Bun.file(join(cosmos, "tests/publication.spec.ts")).text(),
    Bun.file(join(cosmos, "tests/release.spec.ts")).text(),
    Bun.file(join(cosmos, "tests/ham-005.boundary.spec.ts")).text(),
  ])

  expect(browser).toContain("LOAD_TEST_ARTIFACTS: JSON.stringify(fixtureArtifacts)")
  expect(browser).not.toContain('`--port=${port}`')
  expect(browser).not.toContain('"server.ts",')
  expect(browser).toContain("releaseWorkspaceState(cosmos)")

  expect(profiles).not.toContain('join(cosmos, "internal/visual/.typecheck')
  expect(profiles).not.toContain("Bun.write(manifestPath")
  expect(profiles).not.toContain('join(cosmos, "release/dist')
  expect(profiles).toContain("release-workspace-process.ts")
  expect(profiles).toContain("releaseWorkspaceState(cosmos)")

  expect(publication).not.toContain('new URL("../release/package.json"')
  expect(publication).toContain("release-workspace-process.ts")
  expect(release).not.toContain("recoverPublication")
  expect(ham005).toContain('artifact: join(directory, "release-main.js")')
  expect(ham005).toContain('const visualOutdir = join(directory, "visual-main")')
  expect(ham005).toContain("outdir: visualOutdir")
  expect(ham005).toContain("version: visualVersion")
})

async function productionSources() {
  const paths = [
    join(cosmos, "server.ts"),
    join(cosmos, "build.ts"),
    ...await files(join(cosmos, "startup")),
    ...await files(join(cosmos, "release")),
    ...await files(join(cosmos, "shared")),
    ...await files(join(cosmos, "internal/visual")),
  ]
  return await Promise.all(paths
    .filter((path) => !path.includes("/dist/"))
    .map((path) => Bun.file(path).text()))
}

async function files(directory: string): Promise<string[]> {
  return (await Promise.all((await readdir(directory, {withFileTypes: true})).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? [files(path)] : [Promise.resolve([path])]
  }))).flat()
}
