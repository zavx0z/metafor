import {expect, test} from "bun:test"
import {sourceTextEditorLineChanges} from "./source-lines.ts"

test("source editor line changes mark modified lines", () => {
  expect(sourceTextEditorLineChanges("one\ntwo\nthree", "one\nTWO\nthree")).toEqual([
    {line: 2, kind: "modified"},
  ])
})

test("source editor line changes mark added lines", () => {
  expect(sourceTextEditorLineChanges("one\nthree", "one\ntwo\nthree")).toEqual([
    {line: 2, kind: "added"},
  ])
})

test("source editor line changes mark deletion boundary", () => {
  expect(sourceTextEditorLineChanges("one\ntwo\nthree", "one\nthree")).toEqual([
    {line: 2, kind: "deleted"},
  ])
})

test("source editor line changes keep deletion boundary after final line", () => {
  expect(sourceTextEditorLineChanges("one\ntwo", "one")).toEqual([
    {line: 2, kind: "deleted"},
  ])
})

test("source editor line changes keep repeated closing lines inside inserted blocks", () => {
  const before = [
    "routes: {",
    "  health: {",
    "  },",
    "  ws: {",
    "  },",
    "}",
  ].join("\n")
  const after = [
    "routes: {",
    "  health: {",
    "  },",
    "  force: {",
    "    post() {",
    "    },",
    "  },",
    "  ws: {",
    "  },",
    "}",
  ].join("\n")

  expect(sourceTextEditorLineChanges(before, after)).toEqual([
    {line: 4, kind: "added"},
    {line: 5, kind: "added"},
    {line: 6, kind: "added"},
    {line: 7, kind: "added"},
  ])
})
