import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {FIELD_KINDS} from "@ui/components"
import {
  FIELD_ROUTES,
  FIELD_SECTIONS,
  createFieldPlaygroundDefinitions,
  fieldRouteFromSection,
  fieldSectionFromRoute,
} from "./fields.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("restored @ui/components playground", () => {
  test("keeps the historical route shell and adds every universal Field kind", () => {
    const fields = createFieldPlaygroundDefinitions(() => {}, () => {})
    const kinds = new Set(fields.map(({kind}) => kind))
    for (const kind of FIELD_KINDS) expect(kinds.has(kind)).toBeTrue()
    expect(fields.find(({id}) => id === "boolean")).toMatchObject({kind: "boolean", presentation: "switch"})
    expect(FIELD_SECTIONS.map(fieldRouteFromSection)).toEqual([...FIELD_ROUTES])
    expect(FIELD_ROUTES.map(fieldSectionFromRoute)).toEqual([...FIELD_SECTIONS])
  })

  test("uses the restored five-panel interface without Node System ownership", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()
    expect(entry).toContain("Components")
    expect(entry).toContain("Field contract")
    expect(entry).toContain("#catalog")
    expect(entry).toContain("#sectionPanel")
    expect(entry).toContain("#preview")
    expect(entry).toContain("#dock")
    expect(entry).toContain("#parameters")
    for (const forbidden of ["NodeEditor", "NodeCanvas", "BlenderSocket", "NodeSystemSurface", "Hamiltonian", "Bulk"]) {
      expect(entry).not.toContain(forbidden)
    }
  })

  test("builds as a dev-only browser entry with HMR disabled", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    expect(server).toContain("development: {hmr: false}")
    expect(server).toContain("4017")
    const build = await Bun.build({
      entrypoints: [join(playgroundRoot, "entry.ts")],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
      loader: {".wgsl": "text"},
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
  })
})
