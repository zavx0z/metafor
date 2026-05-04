import {mkdirSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), {recursive: true})
}

export function atomicWriteJson(path: string, value: unknown): void {
  ensureParentDir(path)
  const tmpPath = `${path}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmpPath, path)
}
