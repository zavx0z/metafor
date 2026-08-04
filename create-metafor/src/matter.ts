import ts from "typescript"
import type {MetaAddress} from "@metafor/types/metafor/graph"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaMatterRequest} from "@metafor/types/metafor/authoring"
import type {ForceMessageInput} from "shared/protocol/force/message"

export type MatterPatchErrorCode =
  | "parent_missing"
  | "unsupported_matter_source"
  | "child_already_attached"
  | "child_occurrence_missing"
  | "child_occurrence_ambiguous"
  | "child_occurrence_bound"

export class MatterPatchError extends Error {
  override readonly name = "MatterPatchError"

  constructor(readonly code: MatterPatchErrorCode, message: string) {
    super(message)
  }
}

export interface MatterParentSnapshot {
  address: MetaAddress
  targetPath: string
  source: string
  matter: readonly MatterParticle[]
}

export interface MatterSourceEdit {
  address: MetaAddress
  targetPath: string
  beforeSource: string
  afterSource: string
}

export interface MetaMatterPatchPlan {
  particle: ForceMessageInput
  sourceEdits: MatterSourceEdit[]
}

type MatterTemplateRange = {
  contentStart: number
  contentEnd: number
  callIndent: string
}

const unwrap = (value: ts.Expression): ts.Expression => {
  let current = value
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression
  return current
}

const returnedExpression = (value: ts.Expression): ts.Expression | null => {
  const callback = unwrap(value)
  if (ts.isArrowFunction(callback) && !ts.isBlock(callback.body)) return unwrap(callback.body)
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null
  if (!ts.isBlock(callback.body)) return null
  const returned = callback.body.statements.filter(ts.isReturnStatement)
  return returned.length === 1 && returned[0]!.expression
    ? unwrap(returned[0]!.expression!)
    : null
}

const matterTemplateRange = (source: string): MatterTemplateRange => {
  const file = ts.createSourceFile("meta.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const templates: ts.TaggedTemplateExpression[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "matter" &&
      node.arguments.length === 1
    ) {
      const returned = returnedExpression(node.arguments[0]!)
      if (
        returned &&
        ts.isTaggedTemplateExpression(returned) &&
        ts.isIdentifier(returned.tag) &&
        returned.tag.text === "html"
      ) templates.push(returned)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (templates.length !== 1) {
    throw new MatterPatchError(
      "unsupported_matter_source",
      "meta.ts must contain exactly one .matter callback returning html template",
    )
  }
  const template = templates[0]!.template
  const start = template.getStart(file)
  const end = template.getEnd()
  if (source[start] !== "`" || source[end - 1] !== "`") {
    throw new MatterPatchError("unsupported_matter_source", "Matter html template range is invalid")
  }
  const lineStart = source.lastIndexOf("\n", start) + 1
  const callIndent = /^\s*/.exec(source.slice(lineStart, start))?.[0] ?? ""
  return {contentStart: start + 1, contentEnd: end - 1, callIndent}
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const inertTagPattern = (child: MetaAddress): RegExp =>
  new RegExp(`<meta-for\\s+src\\s*=\\s*(["'])${escapeRegExp(child)}\\1\\s*\\/\\s*>`, "g")

const appendInertTag = (source: string, child: MetaAddress): string => {
  const range = matterTemplateRange(source)
  const content = source.slice(range.contentStart, range.contentEnd)
  const trailing = /\n([ \t]*)$/.exec(content)
  const closingIndent = trailing?.[1] ?? range.callIndent
  const childIndent = `${closingIndent}  `
  const tag = `<meta-for src="${child}" />`
  let after: string
  if (content.trim().length === 0) {
    after = `\n${childIndent}${tag}\n${closingIndent}`
  } else if (trailing) {
    after = `${content.slice(0, trailing.index)}\n${childIndent}${tag}${content.slice(trailing.index)}`
  } else {
    after = `${content}\n${childIndent}${tag}\n${closingIndent}`
  }
  return source.slice(0, range.contentStart) + after + source.slice(range.contentEnd)
}

const removeInertTag = (source: string, child: MetaAddress): string => {
  const range = matterTemplateRange(source)
  const content = source.slice(range.contentStart, range.contentEnd)
  const matches = [...content.matchAll(inertTagPattern(child))]
  if (matches.length !== 1) {
    throw new MatterPatchError(
      matches.length === 0 ? "unsupported_matter_source" : "child_occurrence_ambiguous",
      `Matter source must contain one inert <meta-for src="${child}" />`,
    )
  }
  const match = matches[0]!
  const start = match.index!
  const end = start + match[0].length
  const lineStart = content.lastIndexOf("\n", start - 1) + 1
  const nextBreak = content.indexOf("\n", end)
  const lineEnd = nextBreak === -1 ? content.length : nextBreak
  const wholeLine = content.slice(lineStart, start).trim().length === 0 &&
    content.slice(end, lineEnd).trim().length === 0
  const removeStart = wholeLine ? lineStart : start
  const removeEnd = wholeLine && nextBreak !== -1 ? nextBreak + 1 : end
  const after = content.slice(0, removeStart) + content.slice(removeEnd)
  return source.slice(0, range.contentStart) + after + source.slice(range.contentEnd)
}

const walkMatter = function* (matter: readonly MatterParticle[]): Generator<MatterParticle> {
  const pending = [...matter]
  while (pending.length > 0) {
    const particle = pending.shift()!
    yield particle
    for (const child of particle.children ?? []) pending.push(child.particle)
  }
}

const occurrences = (snapshot: MatterParentSnapshot, child: MetaAddress): MatterParticle[] =>
  [...walkMatter(snapshot.matter)].filter((particle) => particle.kind === "wimp" && particle.src === child)

const inertRootOccurrence = (snapshot: MatterParentSnapshot, child: MetaAddress): number => {
  const all = occurrences(snapshot, child)
  if (all.length === 0) {
    throw new MatterPatchError("child_occurrence_missing", `${snapshot.address} does not contain ${child}`)
  }
  if (all.length !== 1) {
    throw new MatterPatchError("child_occurrence_ambiguous", `${snapshot.address} contains ${child} more than once`)
  }
  const index = snapshot.matter.findIndex((particle) => particle === all[0])
  if (index < 0) {
    throw new MatterPatchError("child_occurrence_bound", `${snapshot.address} contains ${child} below root Matter`)
  }
  const particle = all[0]!
  if (
    particle.kind !== "wimp" ||
    particle.fieldsBinding !== undefined ||
    particle.massBinding !== undefined ||
    particle.energyBinding !== undefined ||
    (particle.children?.length ?? 0) > 0
  ) {
    throw new MatterPatchError("child_occurrence_bound", `${snapshot.address} contains a bound ${child} occurrence`)
  }
  return index
}

const parent = (
  parents: ReadonlyMap<MetaAddress, MatterParentSnapshot>,
  address: MetaAddress,
): MatterParentSnapshot => {
  const snapshot = parents.get(address)
  if (!snapshot) throw new MatterPatchError("parent_missing", `Matter parent snapshot is missing: ${address}`)
  return snapshot
}

const targetValue = (
  address: MetaAddress,
  localId: number,
  position: number,
  child: MetaAddress,
): Record<string, unknown> => ({
  wimp: address,
  id: localId,
  parent: null,
  edgeSlot: "root",
  position,
  kind: "wimp",
  src: child,
})

export const planMetaMatterPatch = (
  request: MetaMatterRequest,
  snapshots: readonly MatterParentSnapshot[],
  timestamp = Date.now(),
): MetaMatterPatchPlan => {
  const parents = new Map(snapshots.map((snapshot) => [snapshot.address, snapshot] as const))
  const edits: MatterSourceEdit[] = []
  if (request.operation === "add") {
    const target = parent(parents, request.toParent)
    if (occurrences(target, request.child).length > 0) {
      throw new MatterPatchError("child_already_attached", `${request.child} is already attached to ${request.toParent}`)
    }
    const afterSource = appendInertTag(target.source, request.child)
    edits.push({
      address: target.address,
      targetPath: target.targetPath,
      beforeSource: target.source,
      afterSource,
    })
    return {
      particle: {parts: [{
        part: "inflaton",
        op: "add",
        path: "matter",
        ts: timestamp,
        value: targetValue(target.address, target.matter.length + 1, target.matter.length, request.child),
      }]},
      sourceEdits: edits,
    }
  }

  const source = parent(parents, request.fromParent)
  const sourceIndex = inertRootOccurrence(source, request.child)
  if (sourceIndex !== source.matter.length - 1) {
    throw new MatterPatchError(
      "child_occurrence_bound",
      `${request.child} must be the last root Matter child of ${request.fromParent}`,
    )
  }
  edits.push({
    address: source.address,
    targetPath: source.targetPath,
    beforeSource: source.source,
    afterSource: removeInertTag(source.source, request.child),
  })
  if (request.operation === "remove") {
    return {
      particle: {parts: [{
        part: "inflaton",
        op: "remove",
        path: "matter",
        ts: timestamp,
        value: {wimp: source.address, id: sourceIndex + 1, src: request.child},
      }]},
      sourceEdits: edits,
    }
  }

  const target = parent(parents, request.toParent)
  if (occurrences(target, request.child).length > 0) {
    throw new MatterPatchError("child_already_attached", `${request.child} is already attached to ${request.toParent}`)
  }
  edits.push({
    address: target.address,
    targetPath: target.targetPath,
    beforeSource: target.source,
    afterSource: appendInertTag(target.source, request.child),
  })
  return {
    particle: {parts: [{
      part: "inflaton",
      op: "move",
      path: "matter",
      from: `${source.address}#${sourceIndex + 1}`,
      ts: timestamp,
      value: targetValue(target.address, target.matter.length + 1, target.matter.length, request.child),
    }]},
    sourceEdits: edits.sort((left, right) => left.address.localeCompare(right.address)),
  }
}
