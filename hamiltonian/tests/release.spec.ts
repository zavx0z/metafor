import {expect, test} from "bun:test"
import {
  nextPackageVersion,
  packageChanges,
  releasedPackages,
} from "../release"

test("package state comes from root caret dependencies", async () => {
  const packages = await releasedPackages()
  expect(packages.map(({name}) => name)).toEqual([
    "@import/main",
    "@import/service",
    "@internal/rpc",
  ])
  expect(packages.map(({cache}) => cache)).toEqual(["import", "import", "internal"])
  for (const entry of packages) {
    expect(entry.endpoint).toBe(`/code?module=${entry.name}&version=${entry.version}`)
    expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
  }
})

test("POST accepts package names and SemVer change but never a ready version", async () => {
  const valid = await packageChanges(request({
    packages: [
      {name: "@import/main", change: "patch"},
      {name: "@internal/rpc", change: "minor"},
      {name: "@import/main", change: "patch"},
    ],
  }))
  expect(valid).toEqual([
    {name: "@import/main", change: "patch"},
    {name: "@internal/rpc", change: "minor"},
  ])

  const explicitVersion = await packageChanges(request({
    packages: [{name: "@import/main", change: "patch", version: "9.9.9"}],
  }))
  expect(explicitVersion).toBeInstanceOf(Response)
  expect((explicitVersion as Response).status).toBe(400)

  const conflicting = await packageChanges(request({
    packages: [
      {name: "@import/main", change: "patch"},
      {name: "@import/main", change: "major"},
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

function request(body: unknown) {
  return new Request("http://127.0.0.1:4444/code", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  })
}
