import {describe, expect, test} from "bun:test"
import {HamiltonianServiceWorkerAdmissionRegistry} from "./service-admission.ts"

const release = (version: string) => ({version, sha256: `sha256:${version}`})
const claim = (
  profileId: string,
  runtimeIncarnation: string,
  codeVersion: string,
  applicationAdmitted = false,
) => ({
  profileId,
  workerEntityId: `service:${profileId}`,
  runtimeIncarnation,
  codeVersion,
  applicationAdmitted,
})

describe("Hamiltonian Service Worker admission registry", () => {
  test("admits current and gates application messages until admission", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const current = claim("current-profile", "current-runtime", "1.1.0")

    expect(registry.applicationMessageAllowed(false, "identity")).toBeTrue()
    expect(registry.applicationMessageAllowed(false, "pong")).toBeTrue()
    expect(registry.applicationMessageAllowed(false, "tabs")).toBeFalse()
    expect(registry.applicationMessageAllowed(false, "peer-signal")).toBeFalse()
    expect(registry.decideIdentity(current, release("1.1.0"))).toEqual({
      kind: "current",
      target: release("1.1.0"),
    })
    registry.confirmCurrent(current)
    expect(registry.applicationMessageAllowed(true, "tabs")).toBeTrue()
    expect(registry.embodiment(current.workerEntityId)).toEqual({
      runtimeIncarnation: "current-runtime",
      codeVersion: "1.1.0",
    })
  })

  test("keeps stale technical-only and records its pending target", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const stale = claim("stale-profile", "stale-runtime", "1.0.0")

    expect(registry.decideIdentity(stale, release("1.1.0"))).toEqual({
      kind: "stale",
      target: release("1.1.0"),
      revokeApplication: false,
    })
    expect(registry.pendingTarget(stale.profileId, stale.workerEntityId)).toEqual({
      runtimeIncarnation: "stale-runtime",
      target: release("1.1.0"),
    })
    expect(registry.applicationMessageAllowed(false, "tabs")).toBeFalse()
  })

  test("reconciles two admitted profiles to one common target", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const profileA = claim("profile-a", "runtime-a1", "1.1.0", true)
    const profileB = claim("profile-b", "runtime-b1", "1.1.0", true)
    registry.confirmCurrent(profileA)
    registry.confirmCurrent(profileB)

    expect(registry.reconcileRelease([
      {...profileA, endpoint: "socket-a"},
      {...profileB, endpoint: "socket-b"},
    ], release("1.2.0"))).toEqual([
      {endpoint: "socket-a", target: release("1.2.0"), revokeApplication: true},
      {endpoint: "socket-b", target: release("1.2.0"), revokeApplication: true},
    ])
    expect(registry.pendingTarget(profileA.profileId, profileA.workerEntityId)?.target)
      .toEqual(release("1.2.0"))
    expect(registry.pendingTarget(profileB.profileId, profileB.workerEntityId)?.target)
      .toEqual(release("1.2.0"))
  })

  test("classifies a late old-version connection against the current target", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const late = claim("late-profile", "late-runtime", "1.0.0")

    expect(registry.decideIdentity(late, release("1.2.0"))).toEqual({
      kind: "stale",
      target: release("1.2.0"),
      revokeApplication: false,
    })
  })

  test("rejects a version change by the same admitted incarnation", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const admitted = claim("stable-profile", "stable-runtime", "1.1.0", true)
    registry.confirmCurrent(admitted)

    expect(registry.decideIdentity(
      {...admitted, codeVersion: "2.0.0"},
      release("2.0.0"),
    )).toEqual({
      kind: "reject",
      reason: "Service Worker code version changed without a new execution",
    })
  })

  test("rejects a target claim by an incarnation already rejected as stale", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const stale = claim("rejected-profile", "rejected-runtime", "1.0.0")
    expect(registry.decideIdentity(stale, release("1.1.0")).kind).toBe("stale")

    expect(registry.decideIdentity(
      {...stale, codeVersion: "1.1.0"},
      release("1.1.0"),
    )).toEqual({
      kind: "reject",
      reason: "Service Worker target version requires a new execution",
    })
  })

  test("accepts only a new incarnation at the pending target", () => {
    const registry = new HamiltonianServiceWorkerAdmissionRegistry()
    const stale = claim("updated-profile", "runtime-old", "1.0.0")
    const target = release("1.1.0")
    expect(registry.decideIdentity(stale, target).kind).toBe("stale")

    const updated = {...stale, runtimeIncarnation: "runtime-new", codeVersion: "1.1.0"}
    expect(registry.decideIdentity(updated, target)).toEqual({kind: "current", target})
    registry.confirmCurrent(updated)

    expect(registry.pendingTarget(updated.profileId, updated.workerEntityId)).toBeUndefined()
    expect(registry.embodiment(updated.workerEntityId)).toEqual({
      runtimeIncarnation: "runtime-new",
      codeVersion: "1.1.0",
    })
  })
})
