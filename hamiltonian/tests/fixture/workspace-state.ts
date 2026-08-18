import {readdir} from "node:fs/promises"
import {relative, join} from "node:path"

/** Побайтный снимок рабочего release/startup contour без test-owned files. */
export async function releaseWorkspaceState(hamiltonian: string) {
  const files = [
    join(hamiltonian, "package.json"),
    join(hamiltonian, "server.ts"),
    join(hamiltonian, "build.ts"),
    ...await sourceFiles(join(hamiltonian, "startup")),
    ...await sourceFiles(join(hamiltonian, "release")),
    ...await sourceFiles(join(hamiltonian, "internal/visual")),
    ...await sourceFiles(join(hamiltonian, "shared")),
    ...await sourceFiles(join(hamiltonian, "static")),
  ]
  return Object.fromEntries(await Promise.all(files.sort().map(async (path) => [
    relative(hamiltonian, path),
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
