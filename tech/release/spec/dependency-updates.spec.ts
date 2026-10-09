/** Новая версия проверяется по собственным новым зависимостям, предыдущая сохраняет прежний контракт. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
import {releaseFixture} from "./fixture"
import type {PackageChange} from "@metafor/tech-release"

describe.each([
  {
    name: "Согласованное обновление зависимости",
    props: {
      changes: [
        {name: "@example/host", change: "patch"},
        {name: "@example/view", change: "minor"},
      ] as PackageChange[],
    },
    expected: {success: true, builds: 5},
  },
  {
    name: "Зависимость осталась на старой версии",
    props: {changes: [{name: "@example/host", change: "patch"}] as PackageChange[]},
    expected: {success: false, builds: 0},
  },
])("$name", ({props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let success = false
  beforeAll(async () => {
    workspace = await releaseFixture(join(import.meta.dir, "fixture/unchanged.json"))
    const path = join(workspace.root, "packages/host/package.json")
    const manifest = await Bun.file(path).json()
    manifest.dependencies["@example/view"] = "workspace:^1.1.0"
    await Bun.write(path, JSON.stringify(manifest))
    try {
      success = (await workspace.release.publishPackages(props.changes)).success
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("requires @example/view@workspace:^1.1.0")
      )
        throw error
    }
  })
  afterAll(async () => {
    await workspace?.cleanup()
  })

  test("Совместимость новой версии", () => {
    expect(success, "Проверяется новая зависимость host, а не снимок предыдущего выпуска").toBe(
      expected.success,
    )
  })
  test("Проверка до компиляции", () => {
    expect(workspace.builds.length, "Несовместимый состав отклоняется до сборки").toBe(
      expected.builds,
    )
  })
})
