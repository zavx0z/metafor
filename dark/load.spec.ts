import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { loadMetaAST } from "./load"
import reference from "../github/zavx0z/git/meta.json"
import type { MetaAST } from "../metafor/ast/ast.t"
import { HubFixture } from "../fixture/hub"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
})

describe("dark/load", () => {
  test("должен загрузить MetaAST из zavx0z/git", async () => {
    const result = await loadMetaAST("zavx0z/git")
    expect(result).toEqual(reference as MetaAST)
  })
})
