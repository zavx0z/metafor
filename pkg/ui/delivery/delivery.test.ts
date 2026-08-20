import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const uiRoot = fileURLToPath(new URL("../", import.meta.url))
const packageRoots = Object.freeze({
  engine: join(uiRoot, "../engine"),
  elements: join(uiRoot, "elements"),
  components: join(uiRoot, "components"),
  nodeUi: join(uiRoot, "../nodes/ui"),
})

const productionExports = Object.freeze({
  elements: Object.freeze({
    ".": "./index.ts",
    "./runtime": "./runtime.ts",
    "./surface": "./surface.ts",
    "./primitives": "./elements.ts",
    "./button": "./button.ts",
    "./div": "./div.ts",
    "./span": "./span.ts",
    "./text": "./text.ts",
    "./img": "./img.ts",
    "./input": "./input.ts",
    "./list": "./list.ts",
    "./scrollbar": "./scrollbar.ts",
    "./style": "./style.ts",
    "./flex": "./flex.ts",
    "./flex-css": "./flexCss.ts",
    "./theme": "./theme.ts",
    "./icons": "./icons.ts",
    "./icon": "./icon.ts",
    "./polyline": "./polyline.ts",
    "./virtual-input": "./virtual-input.ts",
    "./targets": "./targets/index.ts",
  }),
  components: Object.freeze({
    ".": "./index.ts",
    "./button": "./Button.ts",
    "./field": "./Field.ts",
    "./pane": "./Pane.ts",
    "./checkbox": "./Checkbox.ts",
    "./badge": "./Badge.ts",
    "./typography": "./Typography.ts",
    "./text-field": "./TextField.ts",
    "./switcher": "./Switcher.ts",
    "./progress-checkbox": "./ProgressCheckbox.ts",
    "./slider-control": "./SliderControl.ts",
    "./divider": "./Divider.ts",
    "./list": "./List.ts",
    "./table": "./Table.ts",
  }),
  nodeUi: Object.freeze({
    ".": "./index.ts",
    "./node-editor": "./node-editor.ts",
    "./blender-node": "./blender-node.ts",
    "./link-curve": "./link-curve.ts",
  }),
})

type PackageManifest = {
  exports?: Record<string, string | Readonly<{default?: string; types?: string}>>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const readManifest = async (root: string): Promise<PackageManifest> =>
  await Bun.file(join(root, "package.json")).json() as PackageManifest

const manifestTargets = (
  manifest: PackageManifest,
): readonly string[] => Object.values(manifest.exports ?? {}).flatMap((target) =>
  typeof target === "string"
    ? [target]
    : [...new Set([target.default, target.types].filter((entry): entry is string => entry !== undefined))]
)

describe("production UI delivery baseline", () => {
  test("publishes the complete exact production subpath contract", async () => {
    for (const name of ["elements", "components", "nodeUi"] as const) {
      const manifest = await readManifest(packageRoots[name])
      expect(manifest.exports).toEqual(productionExports[name])
    }

    const nodeUi = await readManifest(packageRoots.nodeUi)
    expect(nodeUi.dependencies).not.toHaveProperty("@ui/playground")
    expect(nodeUi.devDependencies).toHaveProperty("@ui/playground", "workspace:*")
  })

  test("keeps every manifest export on an existing production source", async () => {
    for (const root of Object.values(packageRoots)) {
      const manifest = await readManifest(root)
      for (const target of manifestTargets(manifest)) {
        expect(target).not.toContain("playground")
        expect(await Bun.file(join(root, target)).exists(), `${root} exports missing ${target}`).toBeTrue()
      }
    }
  })

  test("builds representative exact imports and compatible root barrels independently", async () => {
    for (const fixture of [
      "exact-elements-button.fixture.ts",
      "exact-components-field.fixture.ts",
      "exact-node-editor.fixture.ts",
      "root-api.fixture.ts",
    ]) {
      const build = await Bun.build({
        entrypoints: [join(uiRoot, "delivery/fixtures", fixture)],
        target: "browser",
        format: "esm",
        minify: true,
        sourcemap: "none",
        loader: {".wgsl": "text"},
      })
      expect(build.success, `${fixture}: ${build.logs.map(({message}) => message).join("\n")}`).toBeTrue()
      expect(build.outputs.some(({path}) => path.endsWith(".js")), fixture).toBeTrue()
    }
  })

  test("keeps production source independent from playground", async () => {
    for (const root of Object.values(packageRoots)) {
      const glob = new Bun.Glob("**/*.ts")
      for await (const relative of glob.scan({cwd: root})) {
        if (relative.startsWith("playground/") || relative.includes(".test.") || relative.includes(".spec.")) continue
        const source = await Bun.file(join(root, relative)).text()
        expect(source, `${root}/${relative}`).not.toMatch(/from\s+["']@ui\/playground(?:\/[^"']*)?["']/)
      }
    }
  })

  test("lets one runtime attach production surfaces without leaf runtime creation", async () => {
    const runtime = await Bun.file(join(packageRoots.elements, "runtime.ts")).text()
    expect(runtime).toContain("surface.attachCanvas(this)")

    for (const name of ["elements", "components", "nodeUi"] as const) {
      const manifest = await readManifest(packageRoots[name])
      for (const [specifier, target] of Object.entries(manifest.exports ?? {})) {
        if (specifier === "." || (name === "elements" && specifier === "./runtime")) continue
        expect(typeof target, `${name} ${specifier}`).toBe("string")
        const source = await Bun.file(join(packageRoots[name], target as string)).text()
        expect(source, `${name} ${specifier}`).not.toContain("UiRuntime.create")
        expect(source, `${name} ${specifier}`).not.toContain("new UiRuntime")
      }
    }
  })

  test("keeps one canonical Engine package identity", async () => {
    const manifest = await Bun.file(join(packageRoots.engine, "package.json")).json() as {
      name: string
      exports: Record<string, unknown>
    }
    expect(manifest.name).toBe("@metafor/engine")
    expect(Object.keys(manifest.exports)).toEqual(["."])
  })
})
