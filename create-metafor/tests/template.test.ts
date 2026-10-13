import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {join} from "node:path"
import {
  MetaPackageTemplateError,
  buildMetaPackageTemplate,
  validateMetaPackageTemplate,
  type MetaPackageTemplate,
} from "../src/template.ts"

const options = () => ({
  identity: {owner: "zavx0z", repository: "lada-test"},
  name: "Lada Test",
  description: "Inert authoring package",
  author: "zavx0z",
  errorLabel: "Error",
  htmlLang: "en",
  profile: "empty" as const,
})

describe("pure Create MetaFor template boundary", () => {
  test("builds and validates the complete empty profile without creating a target", () => {
    const target = join(import.meta.dir, "lada-test")
    expect(existsSync(target)).toBe(false)

    const template = buildMetaPackageTemplate(options())

    expect(existsSync(target)).toBe(false)
    expect(template.source).toBe("zavx0z/lada-test")
    expect(template.files.map(({path}) => path)).toEqual([
      ".gitignore",
      "agents/assistant.tsx",
      "agents/index.tsx",
      "index.html",
      "meta.ts",
      "package.json",
      "src/agents-jsx.d.ts",
      "src/metafor.d.ts",
      "TODO.md",
      "tsconfig.json",
    ])
    const meta = template.files.find(({path}) => path === "meta.ts")!.source
    expect(meta).toContain(".fields((field) => ({}))")
    expect(meta).not.toContain("field.string")
    expect(meta).toContain(".mass(() => ({}))")
    expect(meta).toContain(".processes(() => [])")
    expect(meta).toContain(".matter(({ html }) => html``)")
    expect(meta).toContain('import agents from "./agents/index.tsx"')
    expect(meta.trimEnd()).toEndWith(".agents(agents)")
    expect(template.files.find(file => file.path === "agents/index.tsx")!.source).toContain("export default () => null")
    expect(template.files.find(file => file.path === "agents/assistant.tsx")!.source).toContain("<agent")
    expect(Object.isFrozen(template)).toBe(true)
    expect(Object.isFrozen(template.files)).toBe(true)
  })

  test("keeps the CLI standard profile on the same template path", () => {
    const template = buildMetaPackageTemplate({...options(), profile: "standard"})
    const meta = template.files.find(({path}) => path === "meta.ts")!.source

    expect(meta).toContain(".fields((field) => ({")
    expect(meta).toContain("error: field.string.optional")
    expect(meta).toContain("task: field.string.optional()")
    const agents = template.files.find(file => file.path === "agents/index.tsx")!.source
    expect(agents).toContain("<Assistant")
    expect(agents).toContain("atom={atom}")
  })

  test.each([
    ["nested repository", {...options(), identity: {owner: "zavx0z", repository: "lada/test"}}],
    ["empty owner", {...options(), identity: {owner: "", repository: "lada-test"}}],
  ])("rejects invalid identity: %s", (_label, input) => {
    expect(() => buildMetaPackageTemplate(input)).toThrow(MetaPackageTemplateError)
  })

  test("rejects missing, extra and unsafe files in a supplied template", () => {
    const template = buildMetaPackageTemplate(options())
    const invalid = {
      ...template,
      files: [...template.files.slice(1), {path: "../escape", source: "bad"}],
    } as MetaPackageTemplate

    expect(() => validateMetaPackageTemplate(invalid)).toThrow(
      "Meta package template paths must be unique safe relative paths",
    )
  })

  test("rejects a manifest that no longer exports meta.ts", () => {
    const template = buildMetaPackageTemplate(options())
    const invalid = {
      ...template,
      files: template.files.map((file) => file.path === "package.json"
        ? {...file, source: JSON.stringify({name: "@zavx0z/lada-test"})}
        : file),
    }

    expect(() => validateMetaPackageTemplate(invalid)).toThrow(
      "Meta package manifest does not match its identity",
    )
  })

  test("requires agents directory and the final imported composition for either profile", () => {
    for (const profile of ["empty", "standard"] as const) {
      const template = buildMetaPackageTemplate({...options(), profile})
      expect(() => validateMetaPackageTemplate({...template, files: template.files.filter(file => file.path !== "agents/assistant.tsx")})).toThrow("exact complete file set")
      expect(() => validateMetaPackageTemplate({...template, files: template.files.map(file => file.path === "meta.ts"
        ? {...file, source: file.source.replace(".agents(agents)", "")}
        : file)})).toThrow("imported agents composition")
    }
  })
})
