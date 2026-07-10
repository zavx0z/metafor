import {realpath, stat} from "node:fs/promises"
import {isAbsolute, relative, resolve, sep} from "node:path"

export type FilesystemFixtureActionParams = {
  value: Record<string, unknown>
  mass: Record<string, unknown>
}

export const FILESYSTEM_FIXTURE_MAX_BYTES = 1024 * 1024
export const FILESYSTEM_FIXTURE_MAX_ENTRIES = 1000

const isWithinRoot = (root: string, target: string): boolean => {
  const pathFromRoot = relative(root, target)
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot)
}

export const resolveFilesystemFixturePath = async (
  value: Record<string, unknown>,
  mass: Record<string, unknown>,
): Promise<string> => {
  const root = mass.filesystemRoot
  const path = value.path

  if (typeof root !== "string" || !isAbsolute(root)) {
    throw new TypeError("filesystem capability root must be an absolute path in mass.filesystemRoot")
  }
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new TypeError("filesystem path must be relative")
  }

  const resolvedRoot = await realpath(root)
  if (!(await stat(resolvedRoot)).isDirectory()) {
    throw new TypeError("filesystem root must be a directory")
  }

  const target = resolve(resolvedRoot, path)
  if (!isWithinRoot(resolvedRoot, target)) {
    throw new Error("filesystem path escapes root")
  }

  const resolvedTarget = await realpath(target)
  if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
    throw new Error("filesystem path escapes root")
  }
  return resolvedTarget
}
