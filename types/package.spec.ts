import {describe, expect, test} from "bun:test"
import {existsSync, readFileSync} from "node:fs"
import {join} from "node:path"

type TypesPackage = {
  exports: Record<string, string>
}

const definition = JSON.parse(
  readFileSync(join(import.meta.dir, "package.json"), "utf8"),
) as TypesPackage

describe("@metafor/types public exports", () => {
  test("every declared subpath resolves to an existing source file", () => {
    const missing = Object.entries(definition.exports)
      .filter(([, target]) => !existsSync(join(import.meta.dir, target)))
      .map(([subpath, target]) => `${subpath} -> ${target}`)

    expect(missing).toEqual([])
  })

  test("does not advertise retired or unimplemented APIs", () => {
    expect(definition.exports).not.toHaveProperty("./dark/history")
    expect(definition.exports).not.toHaveProperty("./bulk/protocol")
  })
})
