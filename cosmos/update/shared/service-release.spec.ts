import {describe, expect, test} from "bun:test"
import {
  isHamiltonianServiceWorkerCodeVersion,
  isHamiltonianServiceWorkerRelease,
} from "./service-release.js"

describe("Service Worker code version", () => {
  test("accepts exact SemVer 2.0.0 versions", () => {
    for (const value of [
      "0.0.0",
      "1.0.0",
      "1.2.3-alpha",
      "1.2.3-alpha.1",
      "1.2.3-0A.0-1+build.20260812",
      "999.999.999+sha.abcdef",
    ]) {
      expect(isHamiltonianServiceWorkerCodeVersion(value), value).toBeTrue()
    }
  })

  test("rejects labels and malformed or partial versions", () => {
    for (const value of [
      "",
      "1",
      "1.2",
      "v1.2.3",
      "01.2.3",
      "1.02.3",
      "1.2.03",
      "1.2.3-01",
      "1.2.3-",
      "1.2.3+",
      "1.2.3+build..7",
      "host-v1",
      1,
      null,
    ]) {
      expect(isHamiltonianServiceWorkerCodeVersion(value), String(value)).toBeFalse()
    }
  })
})

describe("Service Worker exact release", () => {
  test("accepts only a valid SemVer and lowercase SHA-256 pair", () => {
    expect(isHamiltonianServiceWorkerRelease({
      version: "1.2.3",
      sha256: "a".repeat(64),
    })).toBeTrue()

    for (const value of [
      null,
      {version: "1.2.3"},
      {version: "v1.2.3", sha256: "a".repeat(64)},
      {version: "1.2.3", sha256: "a".repeat(63)},
      {version: "1.2.3", sha256: "A".repeat(64)},
    ]) {
      expect(isHamiltonianServiceWorkerRelease(value), String(value)).toBeFalse()
    }
  })
})
