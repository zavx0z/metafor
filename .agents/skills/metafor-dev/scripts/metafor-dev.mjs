#!/usr/bin/env bun

import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
export const skillRoot = resolve(scriptDirectory, "..")
export const repositoryRoot = resolve(skillRoot, "../../..")
const worldScript = join(scriptDirectory, "world.mjs")

const expectedFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/current-milestone.md",
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
    area: "force-contract",
    matches: (path) => path.startsWith("force/") || path.startsWith("types/force/"),
    automated: ["bun test force", "bun run typecheck"],
    live: ["inflaton-add"],
    skillSurfaces: ["current milestone", "runtime", "visual acceptance"],
  },
  {
    area: "dark-materialization",
    matches: (path) => path.startsWith("dark/"),
    automated: ["bun test dark", "bun run typecheck"],
    live: ["inflaton-add"],
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
    live: ["bulk-baseline"],
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
    area: "types-contract",
    matches: (path) => path.startsWith("types/") && !path.startsWith("types/force/"),
    automated: ["bun run typecheck"],
    live: [],
    skillSurfaces: ["current milestone when a Particle contract changes"],
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

const parseExplicitPaths = (args) => {
  const index = args.indexOf("--paths")
  if (index < 0) return undefined
  return args.slice(index + 1).filter((arg) => !arg.startsWith("--"))
}

const main = () => {
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
      emit({
        schema: "metafor-dev/run@1",
        ok: false,
        scenario,
        step: "blocked",
        reason: "The external Force ingress contract is the current milestone and is not yet safe to automate.",
        reference: ".agents/skills/metafor-dev/references/current-milestone.md",
      }, 2)
      return
    }

    emit({
      schema: "metafor-dev/run@1",
      ok: false,
      error: `Unknown scenario: ${scenario ?? "(missing)"}`,
      scenarios: ["world status|start|stop|logs", "bulk-baseline", "inflaton-add"],
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

if (import.meta.main) main()
