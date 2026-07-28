import {describe, expect, test} from "bun:test"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {DarkForceTimeController} from "./time-control.ts"

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
  })
})
