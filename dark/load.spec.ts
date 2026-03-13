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
  /**
   * Meta загружается по hub-адресу owner/path.
   * Этот адрес считается каноническим идентификатором сущности,
   * а loader резолвит его в owner/path/meta.json.
   */
  test("должен загрузить MetaAST по hub-адресу zavx0z/git", async () => {
    const result = await loadMetaAST("zavx0z/git")
    expect(result).toEqual(reference as MetaAST)
  })
})
