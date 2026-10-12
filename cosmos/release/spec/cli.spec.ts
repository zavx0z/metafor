import {expect, test} from "bun:test"
import {formatMetaforError, parseMetaforArguments} from "../../cli"

test("CLI separates instance data, root Meta and optional initial code shipment", () => {
  expect(parseMetaforArguments([], "/example")).toEqual({dataRoot: "/example/.metafor", port: 4444})
  expect(parseMetaforArguments([
    "--port", "4777", "--data-dir=./instance", "--meta-root", "../project/meta.ts",
    "--release", "a".repeat(64), "--code-dir", "./code",
  ], "/example")).toEqual({
    dataRoot: "/example/instance", port: 4777, metaRoot: "/project/meta.ts",
    initialDigest: "a".repeat(64), codeRoot: "/example/code",
  })
  expect(parseMetaforArguments(["--help"])).toBe("help")
  for (const args of [
    ["--port", "0"], ["--port", "65536"], ["--port", "1e3"],
    ["--port", "4444", "--port", "5555"], ["--data-dir"],
    ["--release", "not-a-digest"], ["--unknown", "value"],
  ]) expect(() => parseMetaforArguments(args)).toThrow()
})

test("CLI exposes original startup and cleanup failure causes with bounded cyclic diagnostics", () => {
  const binding = new Error("EADDRINUSE: instance port is occupied")
  const cleanup = new Error("Owned process did not stop")
  const failure = new AggregateError([binding, cleanup], "Startup and cleanup failed")
  failure.cause = failure
  const diagnostic = formatMetaforError(failure)
  expect(diagnostic).toContain(binding.message)
  expect(diagnostic).toContain(cleanup.message)
  expect(diagnostic.split("\n")).toHaveLength(3)
  expect(formatMetaforError(new AggregateError(Array.from({length: 100}, () => new Error("x".repeat(100_000))), "large")).length).toBeLessThan(10_000)
})
