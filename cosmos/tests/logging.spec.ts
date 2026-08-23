import {expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import {parseSync, Visitor} from "oxc-parser"
import type {Argument, CallExpression, Expression, Node, ObjectPropertyKind} from "@oxc-project/types"
import {
  checkpointKey,
  diagnosticStories,
  type DiagnosticCheckpoint,
  type DiagnosticLevel,
} from "./fixture/diagnostic-matrix"

const cosmos = fileURLToPath(new URL("../", import.meta.url))
const helperScopes = new Map([
  ["release/server/http/delivery.ts", "[@cosmos/release:server:delivery]"],
  ["release/server/package/build.ts", "[@cosmos/release:server:build]"],
  ["release/server/release/publication.ts", "[@cosmos/release:server:update]"],
  ["release/server/release/update.ts", "[@cosmos/release:server:update]"],
])

interface FoundCheckpoint extends DiagnosticCheckpoint {
  file: string
  line: number
}

test("UPD-003.16 assigns every production diagnostic to one tested story", async () => {
  const expected = diagnosticStories.flatMap(({checkpoints}) => checkpoints)
  const expectedKeys = expected.map(checkpointKey)
  expect(new Set(expectedKeys).size).toBe(expectedKeys.length)

  for (const story of diagnosticStories) {
    expect(story.checkpoints.length).toBeGreaterThan(0)
    expect(story.proofs.length).toBeGreaterThan(0)
    for (const proof of story.proofs) {
      const source = await Bun.file(join(cosmos, "tests", proof.file)).text()
      expect(source).toContain(JSON.stringify(proof.test))
    }
  }

  const actual = await productionDiagnostics()
  const actualKeys = [...new Set(actual.map(checkpointKey))].sort()
  expect(actualKeys).toEqual([...expectedKeys].sort())

  const matrix = new Map(expected.map((entry) => [checkpointKey(entry), entry]))
  for (const found of actual) {
    const contract = matrix.get(checkpointKey(found))
    if (!contract) throw new Error(`Unregistered diagnostic ${found.file}:${found.line}`)
    expect(found.details.slice().sort()).toEqual(contract.details.slice().sort())
  }
})

test("UPD-003.16 keeps all diagnostics structured and owner-scoped", async () => {
  const diagnostics = await productionDiagnostics()
  for (const entry of diagnostics) {
    expect(entry.scope).toMatch(/^\[@(?:cosmos|internal)\/[a-z-]+(?::[a-z-]+)*\]$/)
    expect(entry.event.length).toBeGreaterThan(0)
    expect(entry.details.length).toBeGreaterThan(0)
  }
})

async function productionDiagnostics() {
  const files = await sourceFiles(cosmos)
  return (await Promise.all(files.map(readDiagnostics))).flat()
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "tests") continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path)
  }
  return files
}

async function readDiagnostics(path: string) {
  const file = relative(cosmos, path)
  const source = await Bun.file(path).text()
  const tree = parseSync(path, source).program
  const found: FoundCheckpoint[] = []
  const helperScope = helperScopes.get(file)

  new Visitor({
    CallExpression(node) {
      const direct = consoleLevel(node.callee)
      if (direct) {
        const [scope, event, details] = node.arguments
        if (
          helperScope
          && isText(scope, helperScope)
          && nodeText(event, source) === "event"
          && nodeText(details, source) === "details"
        ) {
          expect(node.arguments).toHaveLength(3)
        } else {
          found.push(checkpointFromCall(direct, scope, event, details, file, node, source))
        }
      } else if (helperScope && nodeText(node.callee, source) === "debug") {
        const [event, details] = node.arguments
        found.push(checkpointFromCall("debug", undefined, event, details, file, node, source, helperScope))
      }
    },
  }).visit(tree)
  return found
}

function checkpointFromCall(
  level: DiagnosticLevel,
  scopeNode: Argument | undefined,
  eventNode: Argument | undefined,
  detailsNode: Argument | undefined,
  file: string,
  call: CallExpression,
  source: string,
  fixedScope?: string,
): FoundCheckpoint {
  const scope = fixedScope ?? text(scopeNode)
  const event = text(eventNode)
  if (!detailsNode || detailsNode.type !== "ObjectExpression")
    throw new Error(`${file}:${line(call, source)} diagnostic details must be an object literal`)
  return {
    level,
    scope,
    event,
    details: detailsNode.properties.map((property) => propertyName(property, source)).sort(),
    file,
    line: line(call, source),
  }
}

function consoleLevel(expression: Expression): DiagnosticLevel | null {
  if (
    expression.type !== "MemberExpression" ||
    expression.computed ||
    expression.object.type !== "Identifier" ||
    expression.object.name !== "console" ||
    expression.property.type !== "Identifier"
  ) return null
  return expression.property.name === "debug" || expression.property.name === "error"
    ? expression.property.name
    : null
}

function propertyName(property: ObjectPropertyKind, source: string) {
  if (property.type !== "Property") {
    throw new Error(`Diagnostic details contain unsupported property ${nodeText(property, source)}`)
  }
  if (property.key.type === "Identifier" || property.key.type === "PrivateIdentifier") {
    return property.key.name
  }
  return text(property.key)
}

function text(node: Node | undefined) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? ""
  }
  throw new Error("Diagnostic scope/event must be a string literal")
}

function isText(node: Node | undefined, expected: string) {
  try {
    return text(node) === expected
  } catch {
    return false
  }
}

function line(node: Node, source: string) {
  return source.slice(0, node.start).split(/\r?\n/).length
}

const nodeText = (node: Node | undefined, source: string): string =>
  node ? source.slice(node.start, node.end) : ""
