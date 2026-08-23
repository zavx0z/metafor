import {readdir} from "node:fs/promises"
import {relative, join} from "node:path"

/** Побайтный снимок рабочего release/startup contour без test-owned files. */
export async function releaseWorkspaceState(cosmos: string) {
  const files = [
    join(cosmos, "package.json"),
    join(cosmos, "server.ts"),
    join(cosmos, "build.ts"),
    ...await sourceFiles(join(cosmos, "startup")),
    ...await sourceFiles(join(cosmos, "release")),
    ...await sourceFiles(join(cosmos, "internal/visual")),
    ...await sourceFiles(join(cosmos, "shared")),
    ...await sourceFiles(join(cosmos, "static")),
  ]
  return Object.fromEntries(await Promise.all(files.sort().map(async (path) => [
    relative(cosmos, path),
    new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex"),
  ])))
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true})
  return (await Promise.all(entries.flatMap((entry) => {
    if (entry.name === "node_modules") return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? [sourceFiles(path)] : [Promise.resolve([path])]
  }))).flat()
}
