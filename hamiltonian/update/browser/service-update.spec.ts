import {describe, expect, test} from "bun:test"
import {HamiltonianServiceWorkerUpdateController} from "./service-update.ts"

const currentRelease = {
  version: "1.1.3",
  sha256: "a".repeat(64),
}
const staleRelease = {
  version: "1.1.4",
  sha256: "b".repeat(64),
}

function createController(overrides: {
  updateRegistration?: () => Promise<unknown>
  admitApplication?: () => void | Promise<void>
} = {}) {
  let updates = 0
  let admissions = 0
  const controller = new HamiltonianServiceWorkerUpdateController({
    codeVersion: currentRelease.version,
    updateRegistration: overrides.updateRegistration ?? (() => {
      updates += 1
      return Promise.resolve()
    }),
    admitApplication: overrides.admitApplication ?? (() => {
      admissions += 1
    }),
  })
  return {
    controller,
    updateCount: () => updates,
    admissionCount: () => admissions,
  }
}

describe("Service Worker browser update controller", () => {
  test("rejects malformed and matching update targets without calling the browser API", () => {
    const fixture = createController()
    for (const target of [
      null,
      {version: "1.1.4", sha256: "invalid"},
      {version: "v1.1.4", sha256: "b".repeat(64)},
      currentRelease,
    ]) {
      expect(fixture.controller.handleUpdateTarget(target)).toEqual({
        accepted: false,
        reason: "invalid Service Worker update target",
      })
    }
    expect(fixture.updateCount()).toBe(0)
  })

  test("closes application admission and invokes registration.update for a valid stale target", async () => {
    const fixture = createController()
    const current = fixture.controller.handleCurrentTarget(currentRelease)
    expect(current.accepted).toBeTrue()
    if (current.accepted) await current.completion
    expect(fixture.controller.applicationReady).toBeTrue()

    const update = fixture.controller.handleUpdateTarget(staleRelease)
    expect(update.accepted).toBeTrue()
    expect(fixture.controller.applicationReady).toBeFalse()
    if (update.accepted) await update.completion
    expect(fixture.updateCount()).toBe(1)
  })

  test("surfaces registration.update failure while keeping application closed", async () => {
    const failure = new Error("browser update failed")
    const fixture = createController({updateRegistration: () => Promise.reject(failure)})
    const update = fixture.controller.handleUpdateTarget(staleRelease)
    expect(update.accepted).toBeTrue()
    if (!update.accepted) throw new Error("expected an accepted update target")
    await expect(update.completion).rejects.toBe(failure)
    expect(fixture.controller.applicationReady).toBeFalse()
  })

  test("rejects malformed and stale current targets without admitting application", () => {
    const fixture = createController()
    for (const target of [
      undefined,
      {version: "1.1.3", sha256: "invalid"},
      staleRelease,
    ]) {
      expect(fixture.controller.handleCurrentTarget(target)).toEqual({
        accepted: false,
        reason: "invalid current Service Worker release",
      })
    }
    expect(fixture.controller.applicationReady).toBeFalse()
    expect(fixture.admissionCount()).toBe(0)
  })

  test("admits a matching current target", async () => {
    const fixture = createController()
    const current = fixture.controller.handleCurrentTarget(currentRelease)
    expect(current.accepted).toBeTrue()
    if (!current.accepted) throw new Error("expected an accepted current target")
    expect(current.transitioned).toBeTrue()
    expect(fixture.controller.applicationReady).toBeTrue()
    await current.completion
    expect(fixture.admissionCount()).toBe(1)
  })

  test("makes repeated current admission idempotent", async () => {
    const fixture = createController()
    const first = fixture.controller.handleCurrentTarget(currentRelease)
    const second = fixture.controller.handleCurrentTarget(currentRelease)
    expect(first.accepted && first.transitioned).toBeTrue()
    expect(second).toMatchObject({accepted: true, transitioned: false, completion: null})
    if (first.accepted) await first.completion
    expect(fixture.admissionCount()).toBe(1)
  })

  test("resets application readiness when the control socket closes", async () => {
    const fixture = createController()
    const current = fixture.controller.handleCurrentTarget(currentRelease)
    if (current.accepted) await current.completion
    fixture.controller.resetApplication()
    expect(fixture.controller.applicationReady).toBeFalse()
  })
})
