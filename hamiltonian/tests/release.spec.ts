import {expect, test} from "bun:test"
import {
  getPackage,
  getRelease,
  nextPackageVersion,
  packageChanges,
  releasedPackageResponse,
  releasedPackages,
} from "../web/release/server"

test("package state comes from root caret dependencies", async () => {
  const packages = await releasedPackages()
  expect(packages.map(({name}) => name)).toEqual([
    "@release/main",
    "@release/service",
    "@internal/visual",
  ])
  expect(packages.map(({cache}) => cache)).toEqual(["release", "release", "internal"])
  for (const entry of packages) {
    expect(entry.endpoint).toBe(`/${entry.name}?version=${entry.version}`)
    expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
  }
})

test("POST accepts package names and SemVer change but never a ready version", async () => {
  const valid = await packageChanges(request({
    packages: [
      {name: "@release/main", change: "patch"},
      {name: "@release/service", change: "minor"},
      {name: "@internal/visual", change: "patch"},
      {name: "@release/main", change: "patch"},
    ],
  }))
  expect(valid).toEqual([
    {name: "@release/main", change: "patch"},
    {name: "@release/service", change: "minor"},
    {name: "@internal/visual", change: "patch"},
  ])

  const explicitVersion = await packageChanges(request({
    packages: [{name: "@release/main", change: "patch", version: "9.9.9"}],
  }))
  expect(explicitVersion).toBeInstanceOf(Response)
  expect((explicitVersion as Response).status).toBe(400)

  const conflicting = await packageChanges(request({
    packages: [
      {name: "@release/main", change: "patch"},
      {name: "@release/main", change: "major"},
    ],
  }))
  expect(conflicting).toBeInstanceOf(Response)
  expect((conflicting as Response).status).toBe(400)

  const startup = await packageChanges(request({
    packages: [{name: "@startup/main", change: "patch"}],
  }))
  expect(startup).toBeInstanceOf(Response)
  expect((startup as Response).status).toBe(404)
})

test("SemVer change resets the lower components", () => {
  expect(nextPackageVersion("1.2.3", "patch")).toBe("1.2.4")
  expect(nextPackageVersion("1.2.3", "minor")).toBe("1.3.0")
  expect(nextPackageVersion("1.2.3", "major")).toBe("2.0.0")
})

test("canonical package URLs separate artifact delivery from release control", async () => {
  const startup = await Bun.file(
    new URL("../web/startup/main/package.json", import.meta.url),
  ).json() as {version: string}
  const [stable, exact, legacy, invalid] = await Promise.all([
    getPackage(new Request("http://127.0.0.1:4444/@startup/main")),
    getPackage(new Request(
      `http://127.0.0.1:4444/@startup/main?version=${startup.version}`,
    )),
    getRelease(new Request("http://127.0.0.1:4444/code?module=@startup/main")),
    getPackage(new Request("http://127.0.0.1:4444/@startup/main?module=@startup/main")),
  ])
  const [stableSource, exactSource] = await Promise.all([stable.text(), exact.text()])

  expect(stable.status).toBe(200)
  expect(exact.status).toBe(200)
  expect(stable.headers.get("X-Package-Name")).toBe("@startup/main")
  expect(stable.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exact.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exactSource).toBe(stableSource)
  expect(stableSource).toContain('import("@release/main")')
  expect(stableSource).not.toContain("/code?module=")
  expect(legacy.status).toBe(404)
  expect(invalid.status).toBe(404)
})

test("current release main serves its exact standalone versioned artifact", async () => {
  const packages = await releasedPackages()
  const releaseMain = packages.find(({name}) => name === "@release/main")
  const visual = packages.find(({name}) => name === "@internal/visual")
  if (!releaseMain || !visual) throw new Error("Window release packages are missing")

  const [stableResponse, exactResponse, visualResponse, versionedBuild] = await Promise.all([
    releasedPackageResponse("@release/main", null),
    releasedPackageResponse("@release/main", releaseMain.version),
    releasedPackageResponse("@internal/visual", visual.version),
    Bun.file(new URL(
      `../web/release/main/dist/versions/${releaseMain.version}/index.js`,
      import.meta.url,
    )).text(),
  ])
  const [stable, exact, visualSource] = await Promise.all([
    stableResponse.text(),
    exactResponse.text(),
    visualResponse.text(),
  ])

  expect(stableResponse.headers.get("X-Package-Version")).toBe(releaseMain.version)
  expect(exactResponse.headers.get("X-Package-Version")).toBe(releaseMain.version)
  expect(stable).toBe(versionedBuild)
  expect(exact).toBe(versionedBuild)
  expect(stable).toContain("@internal/visual")
  expect(stable).not.toContain("visual-canvas")
  expect(stable.length).toBeLessThan(visualSource.length)
})

function request(body: unknown) {
  return new Request("http://127.0.0.1:4444/code", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  })
}
