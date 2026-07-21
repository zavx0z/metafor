#!/usr/bin/env bun

import {existsSync, readdirSync, readFileSync} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {Database} from "bun:sqlite"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
export const skillRoot = resolve(scriptDirectory, "..")
export const repositoryRoot = resolve(skillRoot, "../../..")
const worldScript = join(scriptDirectory, "world.mjs")

const expectedFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "fixtures/zavx0z/capsule/alpha/meta.ts",
  "fixtures/zavx0z/capsule/beta/meta.ts",
  "fixtures/zavx0z/capsule/leaf/meta.ts",
  "fixtures/zavx0z/capsule/meta.ts",
  "references/current-milestone.md",
  "references/module-boundaries.md",
  "references/runtime.md",
  "references/visual-acceptance.md",
  "scripts/metafor-dev.mjs",
  "scripts/metafor-dev.spec.ts",
  "scripts/world.mjs",
]

const impactRules = [
  {
    area: "metafor-dev-contour",
    matches: (path) => path === "AGENTS.md" || path.startsWith(".agents/skills/metafor-dev/"),
    automated: [
      "bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs validate",
      "bun test ./.agents/skills/metafor-dev/scripts/metafor-dev.spec.ts",
    ],
    live: [],
    skillSurfaces: ["SKILL.md", "project agent rule"],
  },
  {
    area: "shared-contract",
    matches: (path) => path.startsWith("shared/"),
    automated: ["bun test shared", "bun run typecheck"],
    live: ["inflaton-add", "meta-read", "bulk-baseline"],
    skillSurfaces: ["current milestone", "runtime", "visual acceptance", "module boundaries"],
  },
  {
    area: "force-contract",
    matches: (path) => path.startsWith("force/") || path.startsWith("types/force/"),
    automated: ["bun test force", "bun run typecheck"],
    live: ["inflaton-add", "meta-read"],
    skillSurfaces: ["current milestone", "runtime", "visual acceptance"],
  },
  {
    area: "dark-materialization",
    matches: (path) => path.startsWith("dark/"),
    automated: ["bun test dark", "bun run typecheck"],
    live: ["meta-read"],
    skillSurfaces: ["current milestone", "runtime"],
  },
  {
    area: "boundary-projection",
    matches: (path) => path.startsWith("boundary/"),
    automated: ["bun test boundary", "bun run typecheck"],
    live: ["inflaton-add"],
    skillSurfaces: ["current milestone", "runtime"],
  },
  {
    area: "matrix-runtime",
    matches: (path) => path.startsWith("matrix/"),
    automated: ["bun test matrix", "bun run typecheck"],
    live: ["bulk-baseline"],
    skillSurfaces: ["runtime", "visual acceptance"],
  },
  {
    area: "bulk-manifestation",
    matches: (path) => ["bulk/", "pkg/engine/", "pkg/ui/", "ui/"].some((prefix) => path.startsWith(prefix)),
    automated: ["bun test bulk", "bun test ./pkg/ui", "bun run typecheck"],
    live: ["bulk-baseline", "inflaton-add"],
    skillSurfaces: ["visual acceptance", "runtime"],
  },
  {
    area: "energy-runtime",
    matches: (path) => path.startsWith("energy/"),
    automated: ["bun test energy", "bun run typecheck"],
    live: ["bulk-baseline"],
    skillSurfaces: ["runtime", "visual acceptance"],
  },
  {
    area: "workspace-contract",
    matches: (path) => ["package.json", "bun.lock", "tsconfig.json"].includes(path),
    automated: ["bun run check"],
    live: ["bulk-baseline"],
    skillSurfaces: ["runtime"],
  },
  {
    area: "source-cluster",
    matches: (path) => path === ".gitignore" || path.endsWith("/.gitkeep") || path.startsWith("cluster/"),
    automated: ["bun run typecheck"],
    live: ["meta-read"],
    skillSurfaces: ["current milestone", "runtime"],
  },
  {
    area: "types-contract",
    matches: (path) => path.startsWith("types/") && !path.startsWith("types/force/"),
    automated: ["bun run typecheck"],
    live: [],
    skillSurfaces: ["current milestone when a Particle contract changes"],
  },
  {
    area: "matter-template",
    matches: (path) => path.startsWith("pkg/template/"),
    automated: ["bun test ./pkg/template", "bun run typecheck"],
    live: ["meta-read"],
    skillSurfaces: ["current milestone", "runtime"],
  },
  {
    area: "project-generator",
    matches: (path) => path.startsWith("create-metafor/"),
    automated: ["bun test ./create-metafor", "bun run --filter create-metafor build"],
    live: [],
    skillSurfaces: ["runtime when the generated project contract changes"],
  },
  {
    area: "project-documentation",
    matches: (path) => path.startsWith("docs/") || path.endsWith(".md"),
    automated: [],
    live: [],
    skillSurfaces: ["current milestone when runtime behavior changes"],
  },
]

const unique = (values) => [...new Set(values)]
const normalizePath = (path) => path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")

export const buildImpact = (inputPaths) => {
  const paths = unique(inputPaths.map(normalizePath).filter(Boolean))
  const matchedRules = []
  const unmappedPaths = []

  for (const path of paths) {
    const matches = impactRules.filter((rule) => rule.matches(path) || rule.matches(`${path}/`))
    if (matches.length === 0) unmappedPaths.push(path)
    else matchedRules.push(...matches)
  }

  const rules = unique(matchedRules.map((rule) => rule.area))
    .map((area) => matchedRules.find((rule) => rule.area === area))

  return {
    schema: "metafor-dev/impact@1",
    ok: unmappedPaths.length === 0,
    paths,
    areas: rules.map((rule) => rule.area),
    automated: unique(rules.flatMap((rule) => rule.automated)),
    live: unique(rules.flatMap((rule) => rule.live)),
    skillSurfaces: unique(rules.flatMap((rule) => rule.skillSurfaces)),
    unmappedPaths,
  }
}

const listFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? listFiles(path) : [path]
})

const markdownLinks = (content) => [...content.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])

export const validateSkill = () => {
  const errors = []
  const warnings = []

  for (const path of expectedFiles) {
    if (!existsSync(join(skillRoot, path))) errors.push(`Missing required file: ${path}`)
  }

  const skillPath = join(skillRoot, "SKILL.md")
  if (existsSync(skillPath)) {
    const skill = readFileSync(skillPath, "utf8")
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatter) errors.push("SKILL.md has no YAML frontmatter")
    else {
      if (!/^name:\s*metafor-dev\s*$/m.test(frontmatter[1])) errors.push("SKILL.md name must be metafor-dev")
      if (!/^description:\s*.+$/m.test(frontmatter[1])) errors.push("SKILL.md description is missing")
    }
  }

  const documentation = existsSync(skillRoot)
    ? listFiles(skillRoot).filter((path) => /\.(md|yaml)$/.test(path))
    : []

  for (const path of documentation) {
    const content = readFileSync(path, "utf8")
    const label = relative(skillRoot, path)

    if (/\bTODO\b|\[TODO\]|<TODO>/i.test(content)) errors.push(`${label} contains a placeholder`)
    if (/\/Users\/[^/]+\//.test(content)) errors.push(`${label} contains a developer-specific absolute path`)
    if (/scripts\/world\.mjs/.test(content)) errors.push(`${label} bypasses the canonical metafor-dev CLI`)

    for (const link of markdownLinks(content)) {
      if (/^(?:[a-z]+:|#|\/)/i.test(link)) continue
      const target = resolve(dirname(path), link.split("#", 1)[0])
      if (!existsSync(target)) errors.push(`${label} has a broken link: ${link}`)
    }
  }

  for (const globalPath of [
    join(homedir(), ".agents/skills/metafor-dev"),
    join(homedir(), ".codex/skills/metafor-dev"),
  ]) {
    if (existsSync(globalPath) && resolve(globalPath) !== resolve(skillRoot)) {
      warnings.push(`A non-canonical global copy exists: ${globalPath}`)
    }
  }

  const rootAgentRule = join(repositoryRoot, "AGENTS.md")
  if (!existsSync(rootAgentRule)) errors.push("Repository root AGENTS.md is missing")
  else if (!readFileSync(rootAgentRule, "utf8").includes(".agents/skills/metafor-dev")) {
    errors.push("Repository root AGENTS.md does not route agents to metafor-dev")
  }

  return {
    schema: "metafor-dev/validate@1",
    ok: errors.length === 0,
    skillRoot: relative(repositoryRoot, skillRoot),
    checkedFiles: expectedFiles.length,
    errors,
    warnings,
  }
}

const changedPaths = () => {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(result.stderr || "git status failed")

  const entries = result.stdout.split("\0").filter(Boolean)
  const paths = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const status = entry.slice(0, 2)
    paths.push(entry.slice(3))
    if (status.includes("R") || status.includes("C")) {
      index += 1
      if (entries[index]) paths.push(entries[index])
    }
  }
  return paths
}

const runWorld = (args) => {
  const result = spawnSync(process.execPath, [worldScript, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  })

  let payload
  try {
    payload = JSON.parse(result.stdout)
  } catch {
    payload = {
      schema: "metafor-dev/world-wrapper@1",
      ok: false,
      error: "world helper returned invalid JSON",
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  return { payload, exitCode: result.status ?? 1 }
}

const emit = (payload, exitCode = 0) => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exitCode = exitCode
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

export const buildInflatonAddMessage = (ts, src = "capsule") => ({
  parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src, name: "Capsule"}}],
})

export const buildInflatonTestMessage = (src, ts) => ({
  parts: [{part: "inflaton", op: "test", path: src, ts}],
})

const runInflatonAdd = async () => {
  const world = runWorld(["status"])
  if (world.payload.ok !== true) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "inflaton-add",
        step: "runtime-not-ready",
        world: world.payload,
      },
      exitCode: 1,
    }
  }

  const ts = Date.now()
  const src = `capsule-${ts}`
  const request = buildInflatonAddMessage(ts, src)
  let response
  let responseBody
  try {
    response = await fetch("http://127.0.0.1:4000/force", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(request),
    })
    responseBody = await response.json()
  } catch (error) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "inflaton-add",
        step: "ingress-failed",
        request,
        error: error instanceof Error ? error.message : String(error),
      },
      exitCode: 1,
    }
  }

  const ingressOk = response.ok && responseBody?.ok === true &&
    responseBody?.particle?.by === "agent" && responseBody?.particle?.ts === ts &&
    Array.isArray(responseBody?.delivered) &&
    responseBody.delivered.includes("dark") && responseBody.delivered.includes("bulk")
  if (!ingressOk) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "inflaton-add",
        step: "ingress-rejected",
        request,
        response: {status: response.status, body: responseBody},
      },
      exitCode: 1,
    }
  }

  const databasePath = join(repositoryRoot, ".metafor/dev.sqlite")
  const deadline = Date.now() + 5_000
  let atom = null
  while (Date.now() < deadline) {
    if (existsSync(databasePath)) {
      const database = new Database(databasePath, {readonly: true})
      try {
        atom = database.query(`
          SELECT atom.id, atom.wimp, wimp.name, atom.position
            FROM atom JOIN wimp ON wimp.src = atom.wimp
           WHERE atom.wimp = ? AND atom.parent_atom IS NULL AND atom.parent_topology IS NULL
           ORDER BY atom.id LIMIT 1
        `).get(src)
      } finally {
        database.close()
      }
      if (atom?.name === "Capsule") break
    }
    await delay(50)
  }

  const ok = atom?.name === "Capsule"
  return {
    payload: {
      schema: "metafor-dev/run@1",
      ok,
      scenario: "inflaton-add",
      step: ok ? "browser-checkpoint-required" : "materialization-timeout",
      request,
      src,
      ingress: responseBody,
      canonical: atom,
      target: "http://localhost:4004/",
      checkpoint: ok
        ? `Use the browser to confirm the fresh Capsule Atom ${src} and its transient Particle manifestation.`
        : "Inspect the owned contour logs for the missing Dark or Boundary stage.",
    },
    exitCode: ok ? 0 : 1,
  }
}

export const canonicalWimpSource = (src) => {
  if (typeof src !== "string" || src.length === 0) return false
  const segments = src.split("/")
  return (segments.length === 2 || segments.length === 3) &&
    segments.every((segment) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment))
}

const acceptanceFixtures = {
  capsule: {src: "zavx0z/capsule"},
}

const fixtureSource = (src) => join(skillRoot, "fixtures", src, "meta.ts")

const runMetaRead = async (src, args = []) => {
  if (!canonicalWimpSource(src)) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "invalid-source",
        error: "meta-read requires <owner>/<repository>[/<meta-package>]",
      },
      exitCode: 2,
    }
  }

  const fixtureIndex = args.indexOf("--fixture")
  const fixture = fixtureIndex >= 0 ? args[fixtureIndex + 1] : undefined
  const fixtureConfig = fixture === undefined ? undefined : acceptanceFixtures[fixture]
  if (fixture !== undefined && fixtureConfig === undefined) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "unknown-fixture",
        src,
        fixture,
        availableFixtures: Object.keys(acceptanceFixtures),
      },
      exitCode: 2,
    }
  }
  if (fixtureConfig !== undefined && fixtureConfig.src !== src) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "fixture-source-mismatch",
        src,
        fixture,
        error: `fixture ${fixture} requires WIMP source ${fixtureConfig.src}`,
      },
      exitCode: 2,
    }
  }
  const modulePath = fixture === undefined
    ? join(repositoryRoot, "cluster", src, "meta.ts")
    : fixtureSource(fixtureConfig.src)
  if (fixture !== undefined && !existsSync(modulePath)) {
      return {
        payload: {
          schema: "metafor-dev/run@1",
          ok: false,
          scenario: "meta-read",
          step: "fixture-not-found",
          src,
          fixture,
          expectedModule: relative(repositoryRoot, modulePath),
        },
        exitCode: 2,
      }
  }
  if (!existsSync(modulePath)) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "source-not-found",
        src,
        expectedModule: relative(repositoryRoot, modulePath),
      },
      exitCode: 2,
    }
  }

  const world = runWorld(["status"])
  if (world.payload.ok !== true) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "runtime-not-ready",
        src,
        world: world.payload,
      },
      exitCode: 1,
    }
  }

  const ts = Date.now()
  const request = buildInflatonTestMessage(src, ts)
  let response
  let responseBody
  try {
    response = await fetch("http://127.0.0.1:4000/force", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(request),
    })
    responseBody = await response.json()
  } catch (error) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "ingress-failed",
        src,
        request,
        error: error instanceof Error ? error.message : String(error),
      },
      exitCode: 1,
    }
  }

  const ingressOk = response.ok && responseBody?.ok === true &&
    responseBody?.particle?.part === "inflaton" && responseBody?.particle?.op === "test" &&
    responseBody?.particle?.path === src && responseBody?.particle?.by === "agent" &&
    responseBody?.particle?.ts === ts && Array.isArray(responseBody?.delivered) &&
    responseBody.delivered.includes("dark") && responseBody.delivered.includes("bulk")
  if (!ingressOk) {
    return {
      payload: {
        schema: "metafor-dev/run@1",
        ok: false,
        scenario: "meta-read",
        step: "ingress-rejected",
        src,
        request,
        response: {status: response.status, body: responseBody},
      },
      exitCode: 1,
    }
  }

  const databasePath = join(repositoryRoot, ".metafor/dev.sqlite")
  const deadline = Date.now() + 5_000
  let canonical = null
  while (Date.now() < deadline) {
    if (existsSync(databasePath)) {
      const database = new Database(databasePath, {readonly: true})
      try {
        const wimp = database.query("SELECT src, name FROM wimp WHERE src = ?").get(src)
        const atoms = database.query("SELECT id, parent_atom, parent_topology FROM atom WHERE wimp = ? ORDER BY id").all(src)
        if (wimp) canonical = {wimp, atoms}
      } finally {
        database.close()
      }
      if (canonical) break
    }
    await delay(50)
  }

  const ok = canonical !== null
  return {
    payload: {
      schema: "metafor-dev/run@1",
      ok,
      scenario: "meta-read",
      step: ok ? "browser-checkpoint-required" : "projection-timeout",
      src,
      ...(fixture ? {fixture: {name: fixture, module: relative(repositoryRoot, modulePath)}} : {}),
      request,
      ingress: responseBody,
      canonical,
      target: "http://localhost:4004/",
      checkpoint: ok
        ? "Use the Codex in-app browser to confirm the generated Inflaton manifestations and resulting projection."
        : "Inspect the owned contour logs for the missing Dark read or Boundary projection.",
    },
    exitCode: ok ? 0 : 1,
  }
}

const parseExplicitPaths = (args) => {
  const index = args.indexOf("--paths")
  if (index < 0) return undefined
  return args.slice(index + 1).filter((arg) => !arg.startsWith("--"))
}

const main = async () => {
  const [command = "doctor", ...args] = process.argv.slice(2)

  if (command === "validate") {
    const result = validateSkill()
    emit(result, result.ok ? 0 : 1)
    return
  }

  if (command === "impact") {
    const result = buildImpact(parseExplicitPaths(args) ?? changedPaths())
    emit(result, args.includes("--check") && !result.ok ? 1 : 0)
    return
  }

  if (command === "doctor") {
    const world = runWorld(["status"])
    emit({
      schema: "metafor-dev/doctor@1",
      ok: world.payload.ok === true,
      checks: { world: world.payload },
    }, world.payload.ok === true ? 0 : 1)
    return
  }

  if (command === "run") {
    const [scenario, step = "status", ...scenarioArgs] = args

    if (scenario === "world" && ["status", "start", "stop", "logs"].includes(step)) {
      const world = runWorld([step, ...scenarioArgs])
      emit({
        schema: "metafor-dev/run@1",
        ok: world.payload.ok === true,
        scenario,
        step,
        target: "local development contour on ports 4000-4005",
        result: world.payload,
      }, world.exitCode)
      return
    }

    if (scenario === "bulk-baseline") {
      const world = runWorld(["status"])
      const ok = world.payload.ok === true
      emit({
        schema: "metafor-dev/run@1",
        ok,
        scenario,
        step: ok ? "browser-checkpoint-required" : "runtime-not-ready",
        target: "http://localhost:4004/",
        reference: ".agents/skills/metafor-dev/references/visual-acceptance.md",
        checkpoint: ok
          ? "Use the Codex in-app browser and compare one targeted capture with the expected Bulk state."
          : "Make the owned contour healthy before opening Bulk.",
        world: world.payload,
      }, ok ? 0 : 1)
      return
    }

    if (scenario === "inflaton-add") {
      const result = await runInflatonAdd()
      emit(result.payload, result.exitCode)
      return
    }

    if (scenario === "meta-read") {
      const result = await runMetaRead(step === "status" ? undefined : step, scenarioArgs)
      emit(result.payload, result.exitCode)
      return
    }

    emit({
      schema: "metafor-dev/run@1",
      ok: false,
      error: `Unknown scenario: ${scenario ?? "(missing)"}`,
      scenarios: ["world status|start|stop|logs", "bulk-baseline", "inflaton-add", "meta-read <owner>/<repository>[/<meta-package>] [--fixture capsule]"],
    }, 2)
    return
  }

  emit({
    schema: "metafor-dev/cli@1",
    ok: false,
    error: `Unknown command: ${command}`,
    commands: ["validate", "impact", "doctor", "run"],
  }, 2)
}

if (import.meta.main) void main().catch((error) => emit({
  schema: "metafor-dev/cli@1",
  ok: false,
  error: error instanceof Error ? error.message : String(error),
}, 1))
