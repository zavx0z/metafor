import {describe, expect, test} from "bun:test"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {CheckpointBarrierError} from "./checkpoint/barrier.ts"
import {
  DarkForceCausalReadError,
  DarkForceTimeController,
} from "./time-control.ts"

const input = (ts: number): ForceMessageInput => ({
  parts: [{
    part: "inflaton",
    op: "add",
    path: "wimp",
    ts,
    value: {src: "owner/root", name: "Root"},
  }],
})

const frontier = (acceptanceSequence: number) => ({
  cutId: "cut-time",
  phase: "held" as const,
  acceptanceSequence,
  domains: [],
})

describe("Dark Force causal time control", () => {
  test("holds, steps exactly once, re-holds, and clears the disposable stack on resume", async () => {
    const calls: string[] = []
    let sequence = 4
    const control = new DarkForceTimeController({
      closeExternalAdmission() {
        calls.push("close")
        return {} as never
      },
      openExternalAdmission() {
        calls.push("open")
        return {} as never
      },
      async stepAgentParticle(value) {
        calls.push(`step:${value.parts[0]!.ts}`)
        sequence++
        return {
          ok: true as const,
          delivered: ["dark" as const],
          particle: {...value.parts[0]!, by: "agent" as const},
        }
      },
    }, {
      async holdUnderClosedAdmission() {
        calls.push("hold")
        return frontier(sequence)
      },
      releaseAdmissionHold() {
        calls.push("release")
        return frontier(sequence)
      },
    })

    await expect(control.pauseExternalAdmission()).resolves.toMatchObject({
      id: 1,
      frontier: {acceptanceSequence: 4},
    })
    await expect(control.stepAgentParticle(input(7))).resolves.toMatchObject({
      decision: {ok: true, particle: {by: "agent", ts: 7}},
      frame: {id: 2, frontier: {acceptanceSequence: 5}},
    })
    expect(control.pauseStack()).toHaveLength(2)

    control.resumeExternalAdmission()
    expect(control.pauseStack()).toEqual([])
    expect(calls).toEqual(["close", "hold", "release", "step:7", "hold", "release", "open"])
  })

  test("fails closed when the checkpoint plane is unavailable", async () => {
    const control = new DarkForceTimeController({} as never, null)
    await expect(control.pauseExternalAdmission()).rejects.toThrow("requires the checkpoint plane")
    await expect(control.readAtExactFrontier(async () => "never")).rejects.toMatchObject({
      name: "DarkForceCausalReadError",
      code: "checkpoint-unavailable",
    })
  })

  test("owns one short causal hold and releases it after a successful or failed read", async () => {
    const calls: string[] = []
    const control = new DarkForceTimeController({
      closeExternalAdmission() {
        calls.push("close")
        return {} as never
      },
      openExternalAdmission() {
        calls.push("open")
        return {} as never
      },
    } as never, {
      async holdUnderClosedAdmission() {
        calls.push("hold")
        return frontier(8)
      },
      releaseAdmissionHold() {
        calls.push("release")
        return frontier(8)
      },
    })

    await expect(control.readAtExactFrontier(async (held) => {
      calls.push(`read:${held.acceptanceSequence}`)
      return "exact"
    })).resolves.toBe("exact")
    await expect(control.readAtExactFrontier(async () => {
      calls.push("read:failed")
      throw new Error("projection failed")
    })).rejects.toThrow("projection failed")
    expect(calls).toEqual([
      "close", "hold", "read:8", "release", "open",
      "close", "hold", "read:failed", "release", "open",
    ])
  })

  test("borrows an explicit pause without releasing or reopening it", async () => {
    const calls: string[] = []
    const control = new DarkForceTimeController({
      closeExternalAdmission() {
        calls.push("close")
        return {} as never
      },
      openExternalAdmission() {
        calls.push("open")
        return {} as never
      },
    } as never, {
      async holdUnderClosedAdmission() {
        calls.push("hold")
        return frontier(9)
      },
      releaseAdmissionHold() {
        calls.push("release")
        return frontier(9)
      },
    })

    await control.pauseExternalAdmission()
    await expect(control.readAtExactFrontier(async (held) => {
      calls.push(`read:${held.acceptanceSequence}`)
      return held.phase
    })).resolves.toBe("held")
    expect(calls).toEqual(["close", "hold", "read:9"])
    control.resumeExternalAdmission()
    expect(calls).toEqual(["close", "hold", "read:9", "release", "open"])
  })

  test("reports sequence zero as unknown instead of claiming an exact baseline", async () => {
    let reopened = 0
    const control = new DarkForceTimeController({
      closeExternalAdmission() {
        return {} as never
      },
      openExternalAdmission() {
        reopened++
        return {} as never
      },
    } as never, {
      async holdUnderClosedAdmission() {
        throw new CheckpointBarrierError(
          "sequence_zero_baseline_unresolved",
          "baseline unresolved",
        )
      },
      releaseAdmissionHold() {
        throw new Error("must not release an absent hold")
      },
    })

    const error = await control.readAtExactFrontier(async () => "never").catch((reason) => reason)
    expect(error).toBeInstanceOf(DarkForceCausalReadError)
    expect(error).toMatchObject({code: "baseline-unresolved"})
    expect(reopened).toBe(1)
  })
})
