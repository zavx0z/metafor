import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {SourcedParticle} from "shared/protocol/force/particle"
import {DarkHistory} from "./history.ts"

const temporaryDirectories: string[] = []

const history = (): DarkHistory => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-dark-history-"))
  temporaryDirectories.push(directory)
  return new DarkHistory(join(directory, "particles.jsonl"))
}

const particle = (by: string, ts: number, value: unknown): SourcedParticle => ({
  part: "gluon",
  op: "replace",
  path: 7,
  by,
  ts,
  value,
})

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("DarkHistory", () => {
  test("keeps equal Particle timestamps in one parallel time step", () => {
    const store = history()
    store.record("incoming", particle("matrix", 42, {status: "locked"}))
    store.record("outgoing", particle("dark", 42, {status: "recorded"}))

    expect(store.read()).toMatchObject({
      version: 1,
      throughTs: 42,
      latestTs: 42,
      hasMore: false,
      steps: [{
        ts: 42,
        patches: [
          {direction: "incoming", particle: {by: "matrix", ts: 42}},
          {direction: "outgoing", particle: {by: "dark", ts: 42}},
        ],
      }],
    })
    expect(readFileSync(store.filename, "utf8").trim().split("\n")).toHaveLength(2)
  })

  test("paginates by whole time steps and requires explicit confirmation to clear", () => {
    const store = history()
    store.record("incoming", particle("matrix", 1, "one"))
    store.record("incoming", particle("energy", 1, "parallel"))
    store.record("incoming", particle("energy", 2, "two"))
    store.record("incoming", particle("bulk", 3, "three"))

    expect(store.read({fromTs: 1, limitSteps: 1})).toMatchObject({
      steps: [{ts: 1, patches: [{particle: {value: "one"}}, {particle: {value: "parallel"}}]}],
      throughTs: 1,
      latestTs: 3,
      hasMore: true,
    })
    expect(() => store.clear({})).toThrow("clear-dark-history")
    expect(store.clear({confirm: "clear-dark-history"})).toEqual({
      version: 1,
      removed: 4,
      latestTs: null,
    })
    expect(store.read().steps).toEqual([])
  })

  test("reconstructs the latest time step after reopening the physical journal", () => {
    const first = history()
    first.record("incoming", particle("matrix", 1, "one"))
    const reopened = new DarkHistory(first.filename)

    reopened.record("incoming", particle("energy", 2, "two"))
    expect(reopened.latestTs).toBe(2)
  })
})
