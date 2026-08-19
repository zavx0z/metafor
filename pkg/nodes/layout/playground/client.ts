import {
  getFixtureFamily,
  getPlaygroundFixture,
  PLAYGROUND_FIXTURES,
} from "./fixtures.ts"
import {
  getPlaygroundPolicy,
  PLAYGROUND_POLICIES,
} from "./policy-registry.ts"
import {runPlaygroundLayout} from "./runner.ts"
import type {PlaygroundFixture, PlaygroundRun} from "./types.ts"

const fixtureSelect = query<HTMLSelectElement>("#fixture")
const fixtureDescription = query<HTMLElement>("#fixture-description")
const policySelect = query<HTMLSelectElement>("#policy")
const policyDescription = query<HTMLElement>("#policy-description")
const inputEditor = query<HTMLTextAreaElement>("#input-json")
const singleView = query<HTMLElement>("#single-view")
const comparison = query<HTMLElement>("#comparison")
const viewTitle = query<HTMLElement>("#view-title")
const svgView = query<HTMLElement>("#svg-view")
const metricsOutput = query<HTMLOutputElement>("#metrics")
const resultOutput = query<HTMLElement>("#result-json")
const diagnosticsOutput = query<HTMLElement>("#diagnostics")
const status = query<HTMLElement>("#run-status")
const exportResult = query<HTMLButtonElement>("#export-result")
const exportSvg = query<HTMLButtonElement>("#export-svg")

let currentRun: PlaygroundRun | null = null

for (const fixture of PLAYGROUND_FIXTURES) {
  fixtureSelect.add(new Option(fixture.label, fixture.id))
}
for (const policy of PLAYGROUND_POLICIES) {
  policySelect.add(new Option(policy.label, policy.id))
}

fixtureSelect.addEventListener("change", resetFixture)
policySelect.addEventListener("change", updatePolicyDescription)
query<HTMLButtonElement>("#run").addEventListener("click", runEditedInput)
query<HTMLButtonElement>("#reset").addEventListener("click", resetFixture)
query<HTMLButtonElement>("#compare").addEventListener("click", compareFixtureFamily)
query<HTMLButtonElement>("#export-input").addEventListener("click", () => {
  download("nodes-layout-input.json", inputEditor.value, "application/json")
})
exportResult.addEventListener("click", () => {
  if (currentRun === null) return
  download("nodes-layout-result.json", pretty(currentRun.result), "application/json")
})
exportSvg.addEventListener("click", () => {
  if (currentRun === null) return
  download("nodes-layout-result.svg", currentRun.svg, "image/svg+xml")
})

for (const checkbox of document.querySelectorAll<HTMLInputElement>("[data-layer-toggle]")) {
  checkbox.addEventListener("change", applyLayerVisibility)
}

resetFixture()
updatePolicyDescription()
runEditedInput()

function runEditedInput(): void {
  try {
    const graph = JSON.parse(inputEditor.value) as PlaygroundFixture["graph"]
    const fixture = PLAYGROUND_FIXTURES.find(({id}) => id === fixtureSelect.value)
    const run = runPlaygroundLayout(policySelect.value, graph)
    currentRun = run
    singleView.hidden = false
    comparison.hidden = true
    viewTitle.textContent = `${getPlaygroundPolicy(run.policyId).label} · ${run.result.direction}`
    svgView.innerHTML = run.svg
    metricsOutput.textContent = formatMetrics(run)
    resultOutput.textContent = pretty(run.result)
    diagnosticsOutput.textContent = pretty(successDiagnostics(run, fixture))
    exportResult.disabled = false
    exportSvg.disabled = false
    setStatus("ok", `OK · ${run.result.direction} · ${formatDuration(run.metrics.durationMs)}`)
    applyLayerVisibility()
  } catch (error) {
    currentRun = null
    svgView.replaceChildren()
    metricsOutput.textContent = ""
    resultOutput.textContent = "No public layout result."
    diagnosticsOutput.textContent = pretty(errorDiagnostics(error))
    exportResult.disabled = true
    exportSvg.disabled = true
    setStatus("error", "Layout rejected input")
  }
}

function compareFixtureFamily(): void {
  try {
    const selected = getPlaygroundFixture(fixtureSelect.value)
    const family = getFixtureFamily(selected.family)
    const orientations = ["RIGHT", "DOWN"] as const
    const fixtures = orientations.map((orientation) => {
      const fixture = family.find((candidate) => candidate.expectedDirection === orientation)
      if (fixture === undefined) throw new Error(`Fixture family ${selected.family} has no ${orientation} baseline`)
      return fixture
    })
    const runs = fixtures.map((fixture) => ({
      fixture,
      run: runPlaygroundLayout(policySelect.value, fixture.graph),
    }))
    comparison.replaceChildren(...runs.map(({fixture, run}) => comparisonArticle(fixture, run)))
    comparison.hidden = false
    singleView.hidden = true
    currentRun = runs[0]!.run
    resultOutput.textContent = pretty(Object.fromEntries(runs.map(({fixture, run}) => [fixture.expectedDirection, run.result])))
    diagnosticsOutput.textContent = pretty({
      status: "ok",
      policy: policySelect.value,
      comparison: runs.map(({fixture, run}) => successDiagnostics(run, fixture)),
      validation: "The playground reports the public policy outcome and does not implement an independent layout validator.",
    })
    exportResult.disabled = false
    exportSvg.disabled = false
    setStatus("ok", "Compared RIGHT / DOWN")
    applyLayerVisibility()
  } catch (error) {
    diagnosticsOutput.textContent = pretty(errorDiagnostics(error))
    setStatus("error", "Comparison failed")
  }
}

function comparisonArticle(fixture: PlaygroundFixture, run: PlaygroundRun): HTMLElement {
  const article = document.createElement("article")
  article.dataset.direction = fixture.expectedDirection
  const heading = document.createElement("h2")
  heading.textContent = `${fixture.expectedDirection} · ${formatMetrics(run)}`
  const view = document.createElement("div")
  view.className = "svg-view"
  view.innerHTML = run.svg
  article.append(heading, view)
  return article
}

function resetFixture(): void {
  const fixture = getPlaygroundFixture(fixtureSelect.value || PLAYGROUND_FIXTURES[0]!.id)
  fixtureSelect.value = fixture.id
  fixtureDescription.textContent = `${fixture.description} Expected: ${fixture.expectedDirection}.`
  inputEditor.value = pretty(fixture.graph)
}

function updatePolicyDescription(): void {
  policyDescription.textContent = getPlaygroundPolicy(policySelect.value || PLAYGROUND_POLICIES[0]!.id).description
}

function successDiagnostics(run: PlaygroundRun, fixture: PlaygroundFixture | undefined): unknown {
  const expectedDirection = fixture?.expectedDirection
  return {
    status: "ok",
    policy: run.policyId,
    expectedDirection: expectedDirection ?? null,
    actualDirection: run.result.direction,
    directionMatchesFixture: expectedDirection === undefined ? null : expectedDirection === run.result.direction,
    metrics: run.metrics,
    policyDiagnostics: run.policyDiagnostics,
    validation: "The public policy returned successfully. No playground-owned layout, routing or hard validator was run.",
  }
}

function errorDiagnostics(error: unknown): unknown {
  return {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
    source: "public layout policy",
  }
}

function formatMetrics(run: PlaygroundRun): string {
  const metrics = run.metrics
  return [
    `${metrics.nodeCount} nodes`,
    `${metrics.compoundCount} compounds`,
    `${metrics.portCount} ports`,
    `${metrics.edgeCount} edges`,
    `${metrics.bendCount} bends`,
    `${metrics.gatewayCount} gateways`,
    `${formatDuration(metrics.durationMs)}`,
  ].join(" · ")
}

function formatDuration(value: number): string {
  return `${value.toFixed(2)} ms`
}

function applyLayerVisibility(): void {
  for (const checkbox of document.querySelectorAll<HTMLInputElement>("[data-layer-toggle]")) {
    const layer = checkbox.dataset.layerToggle
    if (layer === undefined) continue
    for (const element of document.querySelectorAll<SVGGElement>(`[data-layer="${layer}"]`)) {
      element.classList.toggle("hidden-layer", !checkbox.checked)
    }
  }
}

function setStatus(kind: "ok" | "error", message: string): void {
  status.dataset.status = kind
  status.textContent = message
}

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], {type}))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`Missing playground element: ${selector}`)
  return element
}
