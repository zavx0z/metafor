import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {buildMetaPackageTemplate} from "../src/template"
import {evaluateMetaSource} from "../../quantum/dark/load"
import {prepareMetaPackage} from "../../tech/build/index"

test.each(["standard", "empty"] as const)("generated %s Meta prepares imported JSX agents once and keeps inert declaration after source removal", async profile => {
  const directory = await mkdtemp(join(tmpdir(), "generated-meta-agents-"))
  const source = join(directory, "source")
  const output = join(directory, "prepared")
  await mkdir(source)
  const template = buildMetaPackageTemplate({identity: {owner: "fixture", repository: "generated-agents"}, name: "Generated agents",
    description: "Source-bound JSX preparation", author: "Fixture", errorLabel: "Error", htmlLang: "en", profile})
  try {
    for (const file of template.files) {
      const target = join(source, file.path)
      await mkdir(dirname(target), {recursive: true})
      await writeFile(target, file.source)
    }
    await symlink(resolve(import.meta.dir, "../../node_modules"), join(source, "node_modules"))
    let reads = 0
    const prepared = await prepareMetaPackage({root: source, address: "@fixture/generated-agents", outdir: output,
      readDeclaration: async sourcePath => {
        reads++
        return await evaluateMetaSource(await Bun.file(sourcePath).text(), {sourcePath})
      }})
    expect(prepared.result.success, `${prepared.result.stderr}\n${prepared.result.stdout}`).toBeTrue()
    expect(reads).toBe(1)
    const entry = prepared.result.outputs.find(item => item.artifact === "./meta")!
    expect(entry).toBeDefined()
    await rm(source, {recursive: true, force: true})
    const installed = (await import(pathToFileURL(entry.path).href)).default
    expect(installed.matter).toHaveLength(profile === "standard" ? 1 : 0)
    if (profile === "standard") {
      expect(installed.matter[0].src).toBe("@metafor/agent")
      expect(installed.matter[0].fieldsBinding.expr).toContain("agent-inspector")
      expect(installed.matter[0].fieldsBinding.expr).toContain("chat")
      expect(installed.matter[0].fieldsBinding.expr).toContain("owner")
    }
    expect(reads).toBe(1)
    expect(await Bun.file(join(source, "agents/index.tsx")).exists()).toBeFalse()
  } finally {await rm(directory, {recursive: true, force: true})}
})
