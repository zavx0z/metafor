import {existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from "node:fs"
import {dirname, isAbsolute, relative, resolve} from "node:path"

export type ApplyPatchOperation = "add" | "update" | "delete" | "move"

export type ApplyPatchFileChange = {
  path: string
  oldPath?: string
  operation: ApplyPatchOperation
  added: number
  removed: number
  bytes: number
  lineChanges: ApplyPatchLineChange[]
}

export type ApplyPatchLineChange = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}

export type ApplyPatchResult = {
  ok: true
  files: ApplyPatchFileChange[]
}

type ApplyPatchOptions = {
  patch: string
  cwd?: string
}

type ParsedPatch = {
  operations: PatchOperation[]
}

type PatchOperation =
  | {type: "add"; path: string; lines: string[]}
  | {type: "delete"; path: string}
  | {type: "update"; path: string; moveTo?: string; hunks: PatchHunk[]}

type UpdatePatchOperation = Extract<PatchOperation, {type: "update"}>

type PatchHunk = {
  oldLines: string[]
  newLines: string[]
}

type PlannedPatchChange = ApplyPatchFileChange & {
  writeText?: string
  deletePath?: string
}

export function applyPatch(options: ApplyPatchOptions): ApplyPatchResult {
  const cwd = resolve(options.cwd ?? process.cwd())
  const parsed = parseApplyPatch(options.patch)
  const operations = mergeRepeatedUpdateOperations(parsed.operations)
  const planned: PlannedPatchChange[] = []
  const touched = new Set<string>()

  for (const operation of operations) {
    if (operation.type === "add") {
      planned.push(planAdd(cwd, operation.path, operation.lines, touched))
      continue
    }
    if (operation.type === "delete") {
      planned.push(planDelete(cwd, operation.path, touched))
      continue
    }
    planned.push(planUpdate(cwd, operation.path, operation.moveTo, operation.hunks, touched))
  }

  for (const change of planned) {
    if (change.writeText === undefined) continue
    mkdirSync(dirname(change.path), {recursive: true})
    writeFileSync(change.path, change.writeText, "utf8")
  }
  for (const change of planned) {
    if (change.deletePath === undefined) continue
    unlinkSync(change.deletePath)
  }

  return {
    ok: true,
    files: planned.map(({writeText: _writeText, deletePath: _deletePath, ...change}) => change),
  }
}

function mergeRepeatedUpdateOperations(operations: PatchOperation[]): PatchOperation[] {
  const out: PatchOperation[] = []
  const updates = new Map<string, UpdatePatchOperation>()

  for (const operation of operations) {
    if (operation.type !== "update" || operation.moveTo !== undefined) {
      out.push(operation)
      continue
    }

    const existing = updates.get(operation.path)
    if (existing !== undefined) {
      existing.hunks.push(...operation.hunks)
      continue
    }

    const next: UpdatePatchOperation = {type: "update", path: operation.path, hunks: [...operation.hunks]}
    updates.set(operation.path, next)
    out.push(next)
  }

  return out
}

export function createReplaceFilePatch(path: string, before: string, after: string, options: {cwd?: string} = {}): string | null {
  if (before === after) return null
  const cwd = resolve(options.cwd ?? process.cwd())
  const patchPath = patchFileName(cwd, path)
  const lines = [
    "*** Begin Patch",
    `*** Update File: ${patchPath}`,
    "@@",
    ...patchTextLines(before).map((line) => `-${line}`),
    ...patchTextLines(after).map((line) => `+${line}`),
    "*** End Patch",
    "",
  ]
  return lines.join("\n")
}

function planAdd(cwd: string, path: string, lines: string[], touched: Set<string>): PlannedPatchChange {
  const target = workspacePath(cwd, path)
  if (existsSync(target)) throw new Error(`file already exists: ${path}`)
  reservePath(touched, target)
  const text = lines.join("")
  return {
    path: target,
    operation: "add",
    added: lines.length,
    removed: 0,
    bytes: Buffer.byteLength(text, "utf8"),
    lineChanges: [],
    writeText: text,
  }
}

function planDelete(cwd: string, path: string, touched: Set<string>): PlannedPatchChange {
  const target = workspacePath(cwd, path)
  if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`file not found: ${path}`)
  reservePath(touched, target)
  const before = readFileSync(target, "utf8")
  return {
    path: target,
    operation: "delete",
    added: 0,
    removed: splitTextLines(before).length,
    bytes: 0,
    lineChanges: [],
    deletePath: target,
  }
}

function planUpdate(cwd: string, path: string, moveTo: string | undefined, hunks: PatchHunk[], touched: Set<string>): PlannedPatchChange {
  const source = workspacePath(cwd, path)
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`file not found: ${path}`)
  const before = readFileSync(source, "utf8")
  const {text, added, removed, lineChanges} = applyHunks(before, hunks, path)
  const target = moveTo === undefined ? source : workspacePath(cwd, moveTo)
  if (target !== source && existsSync(target)) throw new Error(`move target already exists: ${moveTo}`)
  reservePath(touched, source)
  if (target !== source) reservePath(touched, target)
  return {
    path: target,
    ...(target === source ? {} : {oldPath: source}),
    operation: target === source ? "update" : "move",
    added,
    removed,
    bytes: Buffer.byteLength(text, "utf8"),
    lineChanges,
    writeText: text,
    ...(target === source ? {} : {deletePath: source}),
  }
}

function reservePath(touched: Set<string>, path: string): void {
  if (touched.has(path)) throw new Error(`patch touches file more than once: ${path}`)
  touched.add(path)
}

function applyHunks(before: string, hunks: PatchHunk[], path: string): {
  text: string
  added: number
  removed: number
  lineChanges: ApplyPatchLineChange[]
} {
  const lines = splitTextLines(before)
  let searchFrom = 0
  let added = 0
  let removed = 0
  const lineChanges: ApplyPatchLineChange[] = []

  for (const hunk of hunks) {
    const index = findSubsequence(lines, hunk.oldLines, searchFrom)
    const replacementIndex = index >= 0 ? index : findSubsequence(lines, hunk.oldLines, 0)
    if (replacementIndex < 0) throw new Error(`patch hunk does not match: ${path}`)
    lineChanges.push(...hunkLineChanges(hunk, replacementIndex))
    lines.splice(replacementIndex, hunk.oldLines.length, ...hunk.newLines)
    searchFrom = replacementIndex + hunk.newLines.length
    added += hunk.newLines.filter((line) => !hunk.oldLines.includes(line)).length
    removed += hunk.oldLines.filter((line) => !hunk.newLines.includes(line)).length
  }

  return {text: lines.join(""), added, removed, lineChanges}
}

function hunkLineChanges(hunk: PatchHunk, replacementIndex: number): ApplyPatchLineChange[] {
  if (hunk.oldLines.length === hunk.newLines.length) return []

  let prefix = 0
  while (
    prefix < hunk.oldLines.length
    && prefix < hunk.newLines.length
    && hunk.oldLines[prefix] === hunk.newLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < hunk.oldLines.length - prefix
    && suffix < hunk.newLines.length - prefix
    && hunk.oldLines[hunk.oldLines.length - 1 - suffix] === hunk.newLines[hunk.newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldLines = hunk.oldLines.length - prefix - suffix
  const newLines = hunk.newLines.length - prefix - suffix
  if (oldLines === newLines) return []
  return [{
    oldStart: replacementIndex + prefix + 1,
    oldLines,
    newStart: replacementIndex + prefix + 1,
    newLines,
  }]
}

function parseApplyPatch(patch: string): ParsedPatch {
  const lines = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  if (lines[0] !== "*** Begin Patch") throw new Error("patch must start with *** Begin Patch")
  if (lines.at(-1) !== "*** End Patch") throw new Error("patch must end with *** End Patch")

  const operations: PatchOperation[] = []
  let index = 1
  while (index < lines.length - 1) {
    const line = lines[index]!
    if (line.startsWith("*** Add File: ")) {
      const path = nonEmptyPath(line.slice("*** Add File: ".length), "add file")
      index += 1
      const added: string[] = []
      while (index < lines.length - 1 && !isOperationMarker(lines[index]!)) {
        const change = lines[index]!
        if (!change.startsWith("+")) throw new Error(`add file line must start with +: ${path}`)
        added.push(`${change.slice(1)}\n`)
        index += 1
      }
      operations.push({type: "add", path, lines: added})
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      operations.push({type: "delete", path: nonEmptyPath(line.slice("*** Delete File: ".length), "delete file")})
      index += 1
      continue
    }
    if (line.startsWith("*** Update File: ")) {
      const path = nonEmptyPath(line.slice("*** Update File: ".length), "update file")
      index += 1
      let moveTo: string | undefined
      if (lines[index]?.startsWith("*** Move to: ") === true) {
        moveTo = nonEmptyPath(lines[index]!.slice("*** Move to: ".length), "move target")
        index += 1
      }
      const hunks: PatchHunk[] = []
      let hunk: PatchHunk | null = null
      while (index < lines.length - 1 && !isOperationMarker(lines[index]!)) {
        const change = lines[index]!
        if (change.startsWith("@@")) {
          if (hunk !== null) hunks.push(hunk)
          hunk = {oldLines: [], newLines: []}
          index += 1
          continue
        }
        if (change === "*** End of File") {
          index += 1
          continue
        }
        hunk ??= {oldLines: [], newLines: []}
        const prefix = change[0]
        if (prefix !== " " && prefix !== "-" && prefix !== "+") {
          throw new Error(`update line must start with space, - or +: ${path}`)
        }
        const content = `${change.slice(1)}\n`
        if (prefix === " ") {
          hunk.oldLines.push(content)
          hunk.newLines.push(content)
        } else if (prefix === "-") {
          hunk.oldLines.push(content)
        } else {
          hunk.newLines.push(content)
        }
        index += 1
      }
      if (hunk !== null) hunks.push(hunk)
      operations.push({type: "update", path, ...(moveTo === undefined ? {} : {moveTo}), hunks})
      continue
    }
    throw new Error(`unknown patch operation: ${line}`)
  }

  return {operations}
}

function isOperationMarker(line: string): boolean {
  return line.startsWith("*** Add File: ")
    || line.startsWith("*** Delete File: ")
    || line.startsWith("*** Update File: ")
}

function nonEmptyPath(path: string, label: string): string {
  const clean = path.trim()
  if (clean.length === 0) throw new Error(`${label} path is empty`)
  return clean
}

function workspacePath(cwd: string, path: string): string {
  const target = isAbsolute(path) ? resolve(path) : resolve(cwd, path)
  const rel = relative(cwd, target)
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`patch path escapes workspace: ${path}`)
  return target
}

function patchFileName(cwd: string, path: string): string {
  const target = isAbsolute(path) ? resolve(path) : resolve(cwd, path)
  const rel = relative(cwd, target)
  return rel.startsWith("..") || isAbsolute(rel) ? target : rel
}

function patchTextLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines
}

function splitTextLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.match(/[^\n]*(?:\n|$)/g) ?? []
  if (lines.at(-1) === "") lines.pop()
  return lines
}

function findSubsequence(haystack: string[], needle: string[], start: number): number {
  if (needle.length === 0) return Math.min(Math.max(start, 0), haystack.length)
  for (let index = Math.max(start, 0); index <= haystack.length - needle.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matched = false
        break
      }
    }
    if (matched) return index
  }
  return -1
}
