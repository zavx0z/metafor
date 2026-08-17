import {expect, test} from "bun:test"
import {
  getPackage,
  getRelease,
  nextPackageVersion,
  packageChanges,
  releasedPackageResponse,
  releasedPackages,
} from "../web/release/server"
import {
  artifactIntegrity,
  packageIdentityHeaders,
  verifyPackageResponse,
} from "../web/package-integrity"
import {
  browserPackageCache,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../web/package-url"
import {updatePackages} from "../web/release/service/storage"

test("package state comes from root caret dependencies", async () => {
  const packages = await releasedPackages()
  expect(packages.map(({name}) => name)).toEqual([
    "@release/main",
    "@release/service",
    "@internal/visual",
  ])
  expect(packages.map(({env}) => env)).toEqual(["main", "service-worker", "main"])
  for (const entry of packages) {
    expect(browserPackageUrl(entry.name, entry.env, entry.version)).toBe(
      `/${entry.name}?env=${entry.env}&version=${entry.version}`,
    )
    expect(browserPackageCache(entry.name)).toBe(
      entry.name.startsWith("@internal/") ? "internal" : "release",
    )
    expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(entry.size).toBeGreaterThan(0)
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

test("browser package URL has one canonical env and version order", () => {
  const stable = browserPackageUrl("@internal/visual", "main")
  const exact = browserPackageUrl("@internal/visual", "main", "0.1.3")
  expect(stable).toBe("/@internal/visual?env=main")
  expect(exact).toBe("/@internal/visual?env=main&version=0.1.3")
  expect(() => browserPackageUrl("@internal/visual", "server" as never)).toThrow(
    "Некорректная среда browser package",
  )
  expect(parseBrowserPackageUrl(new URL(stable, "http://127.0.0.1:4444"))).toEqual({
    name: "@internal/visual",
    env: "main",
    version: null,
  })
  expect(parseBrowserPackageUrl(new URL(exact, "http://127.0.0.1:4444"))).toEqual({
    name: "@internal/visual",
    env: "main",
    version: "0.1.3",
  })

  for (const path of [
    "/@internal/visual",
    "/@internal/visual?env=server",
    "/@internal/visual?env=server-worker",
    "/@internal/visual?version=0.1.3&env=main",
    "/@internal/visual?env=main&env=worker",
    "/@internal/visual?env=main&version=0.1.3&extra=1",
    "/@internal/visual?env=main&version=0.1",
  ]) expect(parseBrowserPackageUrl(new URL(path, "http://127.0.0.1:4444"))).toBeNull()
})

test("Worker accepts only complete artifact identity without endpoint or cache", async () => {
  const bytes = new TextEncoder().encode("export const value = 1")
  const identity = {
    name: "@internal/visual",
    env: "main" as const,
    version: "1.2.3",
    ...await artifactIntegrity(bytes.buffer),
  }
  expect(updatePackages([identity])).toEqual([identity])
  expect(updatePackages([{...identity, endpoint: "/@internal/visual"}])).toBeNull()
  expect(updatePackages([{...identity, cache: "internal"}])).toBeNull()
  expect(updatePackages([{...identity, env: "server"}])).toBeNull()
  expect(updatePackages([{...identity, sha256: "0".repeat(64)}])).toEqual([
    {...identity, sha256: "0".repeat(64)},
  ])

  const response = new Response(bytes, {headers: packageIdentityHeaders(identity)})
  expect(await verifyPackageResponse(response, identity)).toBe(response)
  await expect(verifyPackageResponse(
    new Response("changed", {headers: packageIdentityHeaders(identity)}),
    identity,
  )).rejects.toThrow("Bytes не совпадают")
})

test("canonical package URLs separate artifact delivery from release control", async () => {
  const startup = await Bun.file(
    new URL("../web/startup/main/package.json", import.meta.url),
  ).json() as {version: string}
  const [stable, exact, legacy, invalid, missingEnv, reordered] = await Promise.all([
    getPackage(new Request("http://127.0.0.1:4444/@startup/main?env=main")),
    getPackage(new Request(
      `http://127.0.0.1:4444/@startup/main?env=main&version=${startup.version}`,
    )),
    getRelease(new Request("http://127.0.0.1:4444/code?module=@startup/main")),
    getPackage(new Request("http://127.0.0.1:4444/@startup/main?module=@startup/main")),
    getPackage(new Request("http://127.0.0.1:4444/@startup/main")),
    getPackage(new Request(
      `http://127.0.0.1:4444/@startup/main?version=${startup.version}&env=main`,
    )),
  ])
  const [stableSource, exactSource] = await Promise.all([stable.text(), exact.text()])

  expect(stable.status).toBe(200)
  expect(exact.status).toBe(200)
  expect(stable.headers.get("X-Package-Name")).toBe("@startup/main")
  expect(stable.headers.get("X-Package-Env")).toBe("main")
  expect(stable.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exact.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exactSource).toBe(stableSource)
  expect(stableSource).toContain('import("@release/main")')
  expect(stableSource).not.toContain("/code?module=")
  expect(legacy.status).toBe(404)
  expect(invalid.status).toBe(404)
  expect(missingEnv.status).toBe(404)
  expect(reordered.status).toBe(404)
})

test("current release main serves its exact standalone versioned artifact", async () => {
  const packages = await releasedPackages()
  const releaseMain = packages.find(({name}) => name === "@release/main")
  const visual = packages.find(({name}) => name === "@internal/visual")
  if (!releaseMain || !visual) throw new Error("Window release packages are missing")

  const [stableResponse, exactResponse, visualResponse, versionedBuild] = await Promise.all([
    releasedPackageResponse("@release/main", "main", null),
    releasedPackageResponse("@release/main", "main", releaseMain.version),
    releasedPackageResponse("@internal/visual", "main", visual.version),
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
  expect(stableResponse.headers.get("X-Package-Env")).toBe("main")
  expect(stableResponse.headers.get("X-Package-SHA256")).toBe(releaseMain.sha256)
  expect(stableResponse.headers.get("X-Package-Size")).toBe(String(releaseMain.size))
  expect(exactResponse.headers.get("X-Package-Version")).toBe(releaseMain.version)
  expect(stable).toBe(versionedBuild)
  expect(exact).toBe(versionedBuild)
  expect(stable).toContain("@internal/visual")
  expect(stable).not.toContain("visual-canvas")
  expect(stable.length).toBeLessThan(visualSource.length)
  expect(await artifactIntegrity(new TextEncoder().encode(stable).buffer)).toEqual({
    sha256: releaseMain.sha256,
    size: releaseMain.size,
  })
})

function request(body: unknown) {
  return new Request("http://127.0.0.1:4444/code", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  })
}
