import {describe, expect, test} from "bun:test"
import {isHamiltonianServiceWorkerCodeVersion} from "./service-worker-release.js"

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
