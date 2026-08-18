import {beforeAll, expect, setDefaultTimeout, test} from "bun:test"
import {
  getPackage,
  getRelease,
  nextPackageVersion,
  notifyRelease,
  packageChanges,
  packageOwners,
  recoverPublication,
  readReleaseComposition,
  releaseDelta,
  parseReleaseChangedMessage,
  parseReleaseCurrentMessage,
  parseReleaseDeltaMessage,
  releasedPackageResponse,
  releasedPackages,
  satisfiesWorkspaceRange,
  validateBrowserReleaseEnvironments,
  validateReleaseDependencyGraph,
  validateTargetReleaseVersions,
} from "../release/server"
import {
  artifactIntegrity,
  packageIdentityHeaders,
  verifyPackageResponse,
} from "../shared/package/integrity"
import {
  browserPackageCache,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../shared/package/url"
import {cachedPackageIdentity} from "../release/service-worker/cache/current"

setDefaultTimeout(30_000)

beforeAll(async () => {
  await recoverPublication()
})

test("package state comes from root caret dependencies", async () => {
  const packages = await releasedPackages()
  expect(packages.map(({name}) => name)).toEqual([
    "@hamiltonian/release",
    "@hamiltonian/release",
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
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@internal/visual", change: "patch"},
      {name: "@hamiltonian/release", change: "patch"},
    ],
  }))
  expect(valid).toEqual([
    {name: "@hamiltonian/release", change: "patch"},
    {name: "@internal/visual", change: "patch"},
  ])

  const explicitVersion = await packageChanges(request({
    packages: [{name: "@hamiltonian/release", change: "patch", version: "9.9.9"}],
  }))
  expect(explicitVersion).toBeInstanceOf(Response)
  expect((explicitVersion as Response).status).toBe(400)

  const conflicting = await packageChanges(request({
    packages: [
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@hamiltonian/release", change: "major"},
    ],
  }))
  expect(conflicting).toBeInstanceOf(Response)
  expect((conflicting as Response).status).toBe(400)

  const startup = await packageChanges(request({
    packages: [{name: "@hamiltonian/startup", change: "patch"}],
  }))
  expect(startup).toBeInstanceOf(Response)
  expect((startup as Response).status).toBe(404)
})

test("release membership is closed over compatible runtime dependencies", async () => {
  const current = await readReleaseComposition()
  expect(current.map(({name}) => name)).toEqual([
    "@hamiltonian/release",
    "@internal/visual",
  ])
  expect(() => validateReleaseDependencyGraph(current)).not.toThrow()

  const addition = {
    name: "@internal/independent",
    version: "0.1.0",
    dependencies: {},
  }
  expect(() => validateReleaseDependencyGraph([...current, addition])).not.toThrow()
  expect(() => validateReleaseDependencyGraph(
    current.filter(({name}) => name !== "@internal/visual"),
  )).toThrow("requires missing release package @internal/visual")
  expect(() => validateTargetReleaseVersions(
    current,
    new Map([["@internal/visual", "0.2.0"]]),
  )).toThrow("selected 0.2.0")
  expect(() => validateTargetReleaseVersions(
    current,
    new Map([["@internal/not-a-member", "0.1.0"]]),
  )).toThrow("is not in root membership")

  expect(satisfiesWorkspaceRange("1.9.0", "workspace:^1.2.3")).toBeTrue()
  expect(satisfiesWorkspaceRange("2.0.0", "workspace:^1.2.3")).toBeFalse()
  expect(satisfiesWorkspaceRange("0.1.9", "workspace:^0.1.3")).toBeTrue()
  expect(satisfiesWorkspaceRange("0.2.0", "workspace:^0.1.3")).toBeFalse()
  expect(satisfiesWorkspaceRange("0.0.4", "workspace:^0.0.3")).toBeFalse()
  const serverOwners = await packageOwners("@hamiltonian/release")
  expect(() => validateBrowserReleaseEnvironments(
    "@hamiltonian/release",
    serverOwners.filter(({env}) => env === "server"),
  )).toThrow("has no browser environment")
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
    ...await artifactIntegrity(bytes.buffer as ArrayBuffer),
  }
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [identity],
    remove: [],
  })).toEqual({type: "release-delta", update: [identity], remove: []})
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [{...identity, endpoint: "/@internal/visual"}],
    remove: [],
  })).toBeNull()
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [{...identity, cache: "internal"}],
    remove: [],
  })).toBeNull()
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [{...identity, env: "server"}],
    remove: [],
  })).toBeNull()

  const response = new Response(bytes, {headers: packageIdentityHeaders(identity)})
  expect(await verifyPackageResponse(response, identity)).toBe(response)
  await expect(verifyPackageResponse(
    new Response("changed", {headers: packageIdentityHeaders(identity)}),
    identity,
  )).rejects.toThrow("Bytes не совпадают")
})

test("release RPC carries only a payload-free signal, full current, and update/remove delta", () => {
  const identity = {
    name: "@internal/visual",
    env: "main" as const,
    version: "1.2.3",
    sha256: "a".repeat(64),
    size: 42,
  }

  expect(parseReleaseChangedMessage({type: "release-changed"})).toEqual({
    type: "release-changed",
  })
  expect(parseReleaseChangedMessage({type: "release-changed", packages: []})).toBeNull()
  expect(parseReleaseCurrentMessage({type: "release-current", current: []})).toEqual({
    type: "release-current",
    current: [],
  })
  expect(parseReleaseCurrentMessage({
    type: "release-current",
    current: [identity, identity],
  })).toBeNull()
  expect(parseReleaseCurrentMessage({
    type: "release-current",
    current: [{...identity, endpoint: "/@internal/visual"}],
  })).toBeNull()
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [],
    remove: [],
  })).toEqual({type: "release-delta", update: [], remove: []})
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [identity],
    remove: [],
    desired: [identity],
  })).toBeNull()
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [identity],
    remove: [{name: identity.name, env: identity.env, version: identity.version}],
  })).toBeNull()
})

test("server delta omits unchanged entries and separates update from removal", () => {
  const visual = {
    name: "@internal/visual",
    env: "main" as const,
    version: "1.2.3",
    sha256: "a".repeat(64),
    size: 42,
  }
  const service = {
    name: "@hamiltonian/release",
    env: "service-worker" as const,
    version: "2.0.0",
    sha256: "b".repeat(64),
    size: 84,
  }

  expect(releaseDelta([visual, service], [])).toEqual({
    update: [visual, service],
    remove: [],
  })
  expect(releaseDelta([visual, service], [visual, service])).toEqual({
    update: [],
    remove: [],
  })
  expect(releaseDelta([visual, service], [
    visual,
    {...service, sha256: "c".repeat(64)},
    {...service, version: "1.9.0"},
    {...visual, name: "@internal/removed"},
  ])).toEqual({
    update: [service],
    remove: [
      {name: service.name, env: service.env, version: "1.9.0"},
      {name: "@internal/removed", env: visual.env, version: visual.version},
    ],
  })
})

test("Worker reports only canonical cache entries with verified actual bytes", async () => {
  const bytes = new TextEncoder().encode("export const value = 1")
  const identity = {
    name: "@internal/visual",
    env: "main" as const,
    version: "1.2.3",
    ...await artifactIntegrity(bytes.buffer as ArrayBuffer),
  }
  const request = new Request(
    `http://127.0.0.1:4444${browserPackageUrl(identity.name, identity.env, identity.version)}`,
  )
  const response = new Response(bytes, {headers: packageIdentityHeaders(identity)})

  expect(await cachedPackageIdentity("internal", request, response.clone())).toEqual(identity)
  expect(await cachedPackageIdentity("release", request, response.clone())).toBeNull()
  expect(await cachedPackageIdentity(
    "internal",
    request,
    new Response("changed", {headers: packageIdentityHeaders(identity)}),
  )).toBeNull()
  expect(await cachedPackageIdentity(
    "internal",
    new Request("http://127.0.0.1:4444/@internal/visual?env=main"),
    response.clone(),
  )).toBeNull()
})

test("successful publication notification contains no release state", () => {
  const messages: string[] = []
  notifyRelease({
    topic: "release/service",
    subscriberCount: () => 2,
    publish: (message) => messages.push(message),
  })
  expect(messages).toEqual([JSON.stringify({type: "release-changed"})])
})

test("canonical package URLs separate artifact delivery from release control", async () => {
  const startup = await Bun.file(
    new URL("../startup/package.json", import.meta.url),
  ).json() as {version: string}
  const [stable, exact, legacy, invalid, missingEnv, reordered] = await Promise.all([
    getPackage(new Request("http://127.0.0.1:4444/@hamiltonian/startup?env=main")),
    getPackage(new Request(
      `http://127.0.0.1:4444/@hamiltonian/startup?env=main&version=${startup.version}`,
    )),
    getRelease(new Request("http://127.0.0.1:4444/code?module=@hamiltonian/startup")),
    getPackage(new Request("http://127.0.0.1:4444/@hamiltonian/startup?module=@hamiltonian/startup")),
    getPackage(new Request("http://127.0.0.1:4444/@hamiltonian/startup")),
    getPackage(new Request(
      `http://127.0.0.1:4444/@hamiltonian/startup?version=${startup.version}&env=main`,
    )),
  ])
  const [stableSource, exactSource] = await Promise.all([stable.text(), exact.text()])

  expect(stable.status).toBe(200)
  expect(exact.status).toBe(200)
  expect(stable.headers.get("X-Package-Name")).toBe("@hamiltonian/startup")
  expect(stable.headers.get("X-Package-Env")).toBe("main")
  expect(stable.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exact.headers.get("X-Package-Version")).toBe(startup.version)
  expect(exactSource).toBe(stableSource)
  expect(stableSource).toContain('import("@hamiltonian/release")')
  expect(stableSource).not.toContain("/code?module=")
  expect(legacy.status).toBe(404)
  expect(invalid.status).toBe(404)
  expect(missingEnv.status).toBe(404)
  expect(reordered.status).toBe(404)
})

test("current release main serves its exact standalone versioned artifact", async () => {
  const packages = await releasedPackages()
  const releaseMain = packages.find(
    ({name, env}) => name === "@hamiltonian/release" && env === "main",
  )
  const visual = packages.find(({name}) => name === "@internal/visual")
  if (!releaseMain || !visual) throw new Error("Window release packages are missing")

  const [stableResponse, exactResponse, visualResponse, versionedBuild] = await Promise.all([
    releasedPackageResponse("@hamiltonian/release", "main", null),
    releasedPackageResponse("@hamiltonian/release", "main", releaseMain.version),
    releasedPackageResponse("@internal/visual", "main", visual.version),
    Bun.file(new URL(
      `../release/dist/versions/${releaseMain.version}/main.js`,
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
  expect(await artifactIntegrity(new TextEncoder().encode(stable).buffer as ArrayBuffer)).toEqual({
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
