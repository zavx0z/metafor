import {expect, test} from "bun:test"
import {
  mainRealmRequiresReload,
  sourceRevisionRequiresReload,
} from "./page-update.js"

test("reloads a version only when replacing an active main in the current page realm", () => {
  expect(mainRealmRequiresReload(true, "v1:hash-a", "v2:hash-b")).toBeTrue()
  expect(mainRealmRequiresReload(true, "v2:hash-b", "v2:hash-b")).toBeFalse()
  expect(mainRealmRequiresReload(true, null, "v2:hash-b")).toBeTrue()
  expect(mainRealmRequiresReload(false, "v1:hash-a", "v2:hash-b")).toBeFalse()
  expect(mainRealmRequiresReload(false, null, "v2:hash-b")).toBeFalse()
})

test("reloads one time for each non-empty served-code revision", () => {
  expect(sourceRevisionRequiresReload(null, "source:hash-a")).toBeTrue()
  expect(sourceRevisionRequiresReload("source:hash-a", "source:hash-a")).toBeFalse()
  expect(sourceRevisionRequiresReload("source:hash-a", "source:hash-b")).toBeTrue()
  expect(sourceRevisionRequiresReload("source:hash-a", "")).toBeFalse()
})
