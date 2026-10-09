import {cp, mkdir, mkdtemp, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"

export interface BuildFixtureChanges {
  manifest?: Record<string, unknown>
  dependencies?: Record<string, string>
  files?: Record<string, string>
}

/** Каждый пример получает отдельные исходники и зависимости; исходный fixture не изменяется. */
export async function buildFixture(path: string, changes: BuildFixtureChanges = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tech-build-scenario-"))
  const root = join(directory, "package")
  try {
    await cp(path, root, {recursive: true})
    const modules = join(directory, "node_modules")
    await mkdir(modules, {recursive: true})
    for (const entry of [".bin", "@types", "bun-types", "typescript"]) {
      await symlink(resolve(import.meta.dir, "../../../node_modules", entry), join(modules, entry))
    }
    for (const [name, source] of Object.entries(changes.dependencies ?? {})) {
      const target = join(modules, name)
      await mkdir(dirname(target), {recursive: true})
      await cp(source, target, {recursive: true})
    }
    const manifestPath = join(root, "package.json")
    const manifest = {...(await Bun.file(manifestPath).json()), ...changes.manifest}
    const typecheck = manifest.scripts.typecheck
    manifest.scripts.typecheck = `bun ./record-typecheck.ts && ${typecheck}`
    await Bun.write(
      join(root, "record-typecheck.ts"),
      'import {appendFileSync} from "node:fs"\nappendFileSync("../typechecks.log", "check\\n")\n',
    )
    await Bun.write(manifestPath, JSON.stringify(manifest))
    for (const [path, source] of Object.entries(changes.files ?? {})) {
      await Bun.write(join(root, path), source)
    }
    return {
      root,
      directory,
      name: manifest.name as string,
      manifest: await Bun.file(manifestPath).text(),
      cleanup: () => rm(directory, {recursive: true, force: true}),
    }
  } catch (error) {
    await rm(directory, {recursive: true, force: true})
    throw error
  }
}
