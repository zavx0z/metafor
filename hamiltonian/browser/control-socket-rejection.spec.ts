import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_CONTROL_SOCKET_REJECTION_CODE,
  HAMILTONIAN_CONTROL_SOCKET_REJECTION_REASON_MAX_BYTES,
  rejectHamiltonianControlSocket,
} from "./control-socket-rejection.ts"

describe("browser control socket rejection", () => {
  test("closes only the exact current socket with a browser-safe private code", () => {
    const currentCalls: Array<[number | undefined, string | undefined]> = []
    const staleCalls: Array<[number | undefined, string | undefined]> = []
    const current = {close: (code?: number, reason?: string) => currentCalls.push([code, reason])}
    const stale = {close: (code?: number, reason?: string) => staleCalls.push([code, reason])}
    const slot = {current}

    expect(rejectHamiltonianControlSocket(slot, stale, "stale rejection")).toBeFalse()
    expect(rejectHamiltonianControlSocket(slot, current, "current rejection")).toBeTrue()
    expect(staleCalls).toEqual([])
    expect(currentCalls).toEqual([[HAMILTONIAN_CONTROL_SOCKET_REJECTION_CODE, "current rejection"]])
    expect(HAMILTONIAN_CONTROL_SOCKET_REJECTION_CODE).toBe(4008)
  })

  test("bounds a close reason to 123 complete UTF-8 bytes", () => {
    const calls: Array<[number | undefined, string | undefined]> = []
    const current = {close: (code?: number, reason?: string) => calls.push([code, reason])}
    const reason = `${"a".repeat(120)}🚀trailing`

    expect(rejectHamiltonianControlSocket({current}, current, reason)).toBeTrue()
    const bounded = calls[0]?.[1] ?? ""
    expect(new TextEncoder().encode(bounded).byteLength)
      .toBeLessThanOrEqual(HAMILTONIAN_CONTROL_SOCKET_REJECTION_REASON_MAX_BYTES)
    expect(bounded).toBe("a".repeat(120))
    expect(bounded).not.toContain("�")
  })
})
