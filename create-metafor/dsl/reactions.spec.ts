import {describe, expect, test} from "bun:test"
import {fieldSchema} from "./fields.ts"
import {reactionsSchema} from "./reactions.ts"

describe("Reaction declaration", () => {
  const fields = fieldSchema((field) => ({
    count: field.number.required(0),
    message: field.string.required(""),
    topology: field.enum("one", "two").required("one"),
  }))
  type State = "idle" | "watching"
  type Mass = {history: {readJson(): Promise<unknown>; write(value: unknown): Promise<void>}}

  test("preserves source State selectors and every visible dependency", () => {
    const snapshot = reactionsSchema<typeof fields, State, Mass>((reaction) => [[
      ["idle", "watching"],
      reaction({
        key: "remember",
        label: "Remember",
        mass: {read: ["history"], write: ["history"]},
      })
        .filter([{
          relation: "descendant",
          meta: "owner/sensor",
          states: ["danger"],
        }])
        .equal(async ({mass, observation, update, value}) => {
          await mass.history.write([{state: observation.source.state}])
          update({count: value.count + 1})
        }),
    ]])!

    expect(snapshot.reactions.remember).toMatchObject({
      label: "Remember",
      sources: [{relation: "descendant", meta: "owner/sensor", states: ["danger"]}],
      read: ["count"],
      write: ["count"],
      massRead: ["history"],
      massWrite: ["history"],
      src: expect.any(String),
    })
    expect(snapshot.superposition).toEqual({idle: ["remember"], watching: ["remember"]})
  })

  test("supports exact, type, parent, child and descendant alternatives", () => {
    const snapshot = reactionsSchema<typeof fields, State, {}>((reaction) => [[
      ["watching"],
      reaction({key: "observe"})
        .filter([
          {atom: "atom:7", states: ["ready"]},
          {meta: "owner/device", states: ["offline"]},
          {relation: "parent", states: ["ready"]},
          {relation: "child", meta: "owner/tool", states: ["done"]},
          {relation: "descendant", meta: "owner/service", states: ["failed"]},
        ])
        .equal(() => {}),
    ]])!

    expect(snapshot.reactions.observe?.sources).toHaveLength(5)
  })

  test("deduplicates Mass keys and source States", () => {
    const snapshot = reactionsSchema<typeof fields, State, Mass>((reaction) => [[
      ["idle"],
      reaction({
        key: "dedupe",
        mass: {read: ["history", "history"], write: ["history", "history"]},
      })
        .filter([{meta: "owner/source", states: ["ready", "ready"]}])
        .equal(() => {}),
    ]])!

    expect(snapshot.reactions.dedupe).toMatchObject({
      sources: [{meta: "owner/source", states: ["ready"]}],
      massRead: ["history"],
      massWrite: ["history"],
    })
  })

  test("rejects ambiguous or unstable source declarations", () => {
    expect(() => reactionsSchema<typeof fields, State, {}>((reaction) => [[
      ["idle"],
      reaction({key: "missing"})
        .filter([{states: ["ready"]}])
        .equal(() => {}),
    ]])).toThrow("must declare atom, meta or relation")

    expect(() => reactionsSchema<typeof fields, State, {}>((reaction) => [[
      ["idle"],
      reaction({key: "bad-id"})
        .filter([{atom: "atom:temporary", states: ["ready"]}])
        .equal(() => {}),
    ]])).toThrow("atom:<positive-id>")

    expect(() => reactionsSchema<typeof fields, State, {}>((reaction) => [[
      ["idle"],
      reaction({key: "bad-meta"})
        .filter([{meta: "three/segment/address", states: ["ready"]}])
        .equal(() => {}),
    ]])).toThrow("<owner>/<repository>")
  })

  test("requires a stable semantic key", () => {
    expect(() => reactionsSchema<typeof fields, State, {}>((reaction) => [[
      ["idle"],
      reaction({key: ""})
        .filter([{meta: "owner/source", states: ["ready"]}])
        .equal(() => {}),
    ]])).toThrow("Reaction key is required")
  })

  test("requires at least one active target State", () => {
    expect(() => reactionsSchema<typeof fields, State, {}>((reaction) => [[
      [] as unknown as [State, ...State[]],
      reaction({key: "never-active"})
        .filter([{meta: "owner/source", states: ["ready"]}])
        .equal(() => {}),
    ]])).toThrow("must declare at least one target State")
  })
})
