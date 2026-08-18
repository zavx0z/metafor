import {expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import * as ts from "typescript"
import {
  checkpointKey,
  diagnosticStories,
  type DiagnosticCheckpoint,
  type DiagnosticLevel,
} from "./fixture/diagnostic-matrix"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const helperScopes = new Map([
  ["release/server/http/delivery.ts", "[@hamiltonian/release:server:delivery]"],
  ["release/server/package/build.ts", "[@hamiltonian/release:server:build]"],
  ["release/server/release/publication.ts", "[@hamiltonian/release:server:update]"],
  ["release/server/release/update.ts", "[@hamiltonian/release:server:update]"],
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
      const source = await Bun.file(join(hamiltonian, "tests", proof.file)).text()
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
    expect(entry.scope).toMatch(/^\[@(?:hamiltonian|internal)\/[a-z-]+(?::[a-z-]+)*\]$/)
    expect(entry.event.length).toBeGreaterThan(0)
    expect(entry.details.length).toBeGreaterThan(0)
  }
})

async function productionDiagnostics() {
  const files = await sourceFiles(hamiltonian)
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
  const file = relative(hamiltonian, path)
  const source = await Bun.file(path).text()
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found: FoundCheckpoint[] = []
  const helperScope = helperScopes.get(file)

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const direct = consoleLevel(node.expression)
      if (direct) {
        const [scope, event, details] = node.arguments
        if (
          helperScope
          && isText(scope, helperScope)
          && event?.getText(tree) === "event"
          && details?.getText(tree) === "details"
        ) {
          expect(node.arguments).toHaveLength(3)
        } else {
          found.push(checkpointFromCall(direct, scope, event, details, file, tree, node))
        }
      } else if (helperScope && node.expression.getText(tree) === "debug") {
        const [event, details] = node.arguments
        found.push(checkpointFromCall("debug", undefined, event, details, file, tree, node, helperScope))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

function checkpointFromCall(
  level: DiagnosticLevel,
  scopeNode: ts.Expression | undefined,
  eventNode: ts.Expression | undefined,
  detailsNode: ts.Expression | undefined,
  file: string,
  tree: ts.SourceFile,
  call: ts.CallExpression,
  fixedScope?: string,
): FoundCheckpoint {
  const scope = fixedScope ?? text(scopeNode)
  const event = text(eventNode)
  if (!detailsNode || !ts.isObjectLiteralExpression(detailsNode))
    throw new Error(`${file}:${line(tree, call)} diagnostic details must be an object literal`)
  return {
    level,
    scope,
    event,
    details: detailsNode.properties.map(propertyName).sort(),
    file,
    line: line(tree, call),
  }
}

function consoleLevel(expression: ts.LeftHandSideExpression): DiagnosticLevel | null {
  if (!ts.isPropertyAccessExpression(expression)) return null
  if (expression.expression.getText() !== "console") return null
  return expression.name.text === "debug" || expression.name.text === "error"
    ? expression.name.text
    : null
}

function propertyName(property: ts.ObjectLiteralElementLike) {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text
  if (
    (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property))
    && property.name
  ) {
    if (ts.isIdentifier(property.name) || ts.isPrivateIdentifier(property.name))
      return property.name.text
    return text(property.name)
  }
  throw new Error(`Diagnostic details contain unsupported property ${property.getText()}`)
}

function text(node: ts.Node | undefined) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)))
    return node.text
  throw new Error(`Diagnostic scope/event must be a string literal: ${node?.getText() ?? "missing"}`)
}

function isText(node: ts.Node | undefined, expected: string) {
  return node !== undefined
    && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    && node.text === expected
}

function line(tree: ts.SourceFile, node: ts.Node) {
  return tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1
}
