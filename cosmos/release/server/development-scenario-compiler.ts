import {createHash} from "node:crypto"
import {lstat, readdir, readFile} from "node:fs/promises"
import {dirname, join, relative} from "node:path"
import type {DevelopmentConfiguration} from "../shared/development"

/** Подтверждает весь назначенный native compiler вместе с соседними TypeScript libraries. */
export async function developmentScenarioCompilerDigest(directory: string): Promise<string> {
  const files: string[] = []
  let total = 0
  const visit = async (path: string) => {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Native compiler directory must be owned regular storage")
    for (const entry of await readdir(path, {withFileTypes: true})) {
      if (entry.isSymbolicLink()) throw new Error("Native compiler contains a symbolic link")
      const child = join(path, entry.name)
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile()) files.push(child)
      else throw new Error("Native compiler contains a special file")
      if (files.length > 2048) throw new Error("Native compiler inventory exceeds its limit")
    }
  }
  await visit(directory)
  const hash = createHash("sha256")
  for (const path of files.sort()) {
    const bytes = await readFile(path)
    total += bytes.length
    if (total > 128 * 1024 * 1024) throw new Error("Native compiler bytes exceed their limit")
    hash.update(relative(directory, path)).update("\0").update(createHash("sha256").update(bytes).digest("hex")).update("\n")
  }
  return hash.digest("hex")
}

export async function assignedScenarioCompiler(assignment: NonNullable<DevelopmentConfiguration["scenarios"]>) {
  const info = await lstat(assignment.compilerPath)
  if (!info.isFile() || info.isSymbolicLink() || await developmentScenarioCompilerDigest(dirname(assignment.compilerPath)) !== assignment.compilerSha256)
    throw new Error("Назначенный compiler сценариев изменился")
  return assignment.compilerPath
}
