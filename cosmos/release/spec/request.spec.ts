/** Назначение новой версии зависит от состава выпуска, а не от наличия browser parts. */
import {describe, expect, test} from "bun:test"
import type {PackageChange} from "@metafor/tech-release"
import {packageChanges} from "../server/index.ts"

describe.each<{
  name: string
  props: {members: string[]; packages: PackageChange[]}
  expected: {status: number; changes: PackageChange[] | null}
}>([
  {
    name: "Пакет только для Bun",
    props: {members: ["@internal/server"], packages: [{name: "@internal/server", change: "patch"}]},
    expected: {status: 200, changes: [{name: "@internal/server", change: "patch"}]},
  },
  {
    name: "Повтор одного назначения",
    props: {members: ["@internal/server"], packages: [{name: "@internal/server", change: "patch"}, {name: "@internal/server", change: "patch"}]},
    expected: {status: 200, changes: [{name: "@internal/server", change: "patch"}]},
  },
  {
    name: "Пакет вне состава",
    props: {members: ["@internal/server"], packages: [{name: "@internal/other", change: "patch"}]},
    expected: {status: 404, changes: null},
  },
  {
    name: "Конфликт назначений",
    props: {members: ["@internal/server"], packages: [{name: "@internal/server", change: "patch"}, {name: "@internal/server", change: "major"}]},
    expected: {status: 400, changes: null},
  },
])("$name", async ({props, expected}) => {
  const request = new Request("https://publication.test/code", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({packages: props.packages}),
  })
  const result = await packageChanges(request, async () => props.members)

  test("Допуск назначения", () => {
    expect(result instanceof Response ? result.status : 200, "Разрешённые имена принадлежат полному составу, включая серверные пакеты").toBe(expected.status)
  })

  test("Группа изменений", () => {
    expect(result instanceof Response ? null : result, "Принятые назначения сохраняют вид изменения и не повторяют один пакет").toEqual(expected.changes)
  })
})
