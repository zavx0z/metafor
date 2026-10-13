import {expect, test} from "bun:test"
import {awaitVisualReady} from "./readiness"

test("first presentation failure unmounts the owned root before rejecting and stops pending resource retries", async () => {
  const failure = new Error("Font returned 404")
  let active = true, loads = 0, unmounts = 0
  const root = {unmount() {active = false; unmounts++}}
  const ready = Promise.withResolvers<object>()
  const first = awaitVisualReady(root, () => ready.promise)
  loads++
  ready.reject(failure)
  await expect(first).rejects.toBe(failure)
  // An already scheduled document update cannot retry a stopped root.
  for (let update = 0; update < 100; update++) if (active) loads++
  expect(loads).toBe(1)
  expect(unmounts).toBe(1)
})

test("successful first presentation keeps its root active and returns the same presentation", async () => {
  let unmounts = 0
  const presentation = {space: {}}
  expect(await awaitVisualReady({unmount() {unmounts++}}, async () => presentation)).toBe(presentation)
  expect(unmounts).toBe(0)
})

test("cleanup failure preserves the original startup failure", async () => {
  const failure = new Error("Font unavailable"), cleanup = new Error("Cleanup failed")
  try {
    await awaitVisualReady({unmount() {throw cleanup}}, async () => {throw failure})
    throw new Error("Expected startup failure")
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([failure, cleanup])
  }
})
