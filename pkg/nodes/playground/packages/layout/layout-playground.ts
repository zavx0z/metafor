import {
  getFixtureFamily,
  getPlaygroundFixture,
  PLAYGROUND_FIXTURES,
} from "./layout-fixtures.ts"
import {getPlaygroundPolicy} from "./layout-policies.ts"
import {runPlaygroundLayout} from "./layout-runner.ts"
import type {PlaygroundFixture, PlaygroundRun} from "./layout-playground-types.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "layout"
document.documentElement.dataset.nodesLayoutPlayground = "starting"

const fixtureSelect = query<HTMLSelectElement>("#fixture")
const fixtureDescription = query<HTMLElement>("#fixture-description")
const policyOutput = query<HTMLOutputElement>("#policy-value")
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
fixtureSelect.addEventListener("change", resetAndRunFixture)
query<HTMLButtonElement>("#run").addEventListener("click", runEditedInput)
query<HTMLButtonElement>("#reset").addEventListener("click", resetAndRunFixture)
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
runEditedInput()

function runEditedInput(): void {
  try {
    const graph = JSON.parse(inputEditor.value) as PlaygroundFixture["graph"]
    const fixture = getPlaygroundFixture(fixtureSelect.value)
    const run = runPlaygroundLayout(fixture.policyId, graph)
    currentRun = run
    singleView.hidden = false
    comparison.hidden = true
    comparison.replaceChildren()
    viewTitle.textContent = `${getPlaygroundPolicy(run.policyId).label} · ${formatDirection(run.result.direction)}`
    svgView.innerHTML = run.svg
    metricsOutput.textContent = formatMetrics(run)
    resultOutput.textContent = pretty(run.result)
    diagnosticsOutput.textContent = pretty(successDiagnostics(run, fixture))
    exportResult.disabled = false
    exportSvg.disabled = false
    setStatus("ok", `Готово · ${formatDirection(run.result.direction)} · ${formatDuration(run.metrics.durationMs)}`)
    applyLayerVisibility()
    document.documentElement.dataset.nodesLayoutPlayground = "ready"
    document.documentElement.dataset.nodesPlayground = "ready"
  } catch (error) {
    currentRun = null
    svgView.replaceChildren()
    metricsOutput.textContent = ""
    resultOutput.textContent = "Публичный результат раскладки не получен."
    diagnosticsOutput.textContent = pretty(errorDiagnostics(error))
    exportResult.disabled = true
    exportSvg.disabled = true
    setStatus("error", "Раскладка отклонила входные данные")
    document.documentElement.dataset.nodesLayoutPlayground = "error"
    document.documentElement.dataset.nodesPlayground = "error"
  }
}

function compareFixtureFamily(): void {
  try {
    const selected = getPlaygroundFixture(fixtureSelect.value)
    const family = getFixtureFamily(selected.family)
    const orientations = ["RIGHT", "DOWN"] as const
    const fixtures = orientations.map((orientation) => {
      const fixture = family.find((candidate) => candidate.expectedDirection === orientation)
      if (fixture === undefined) throw new Error(`В семействе сценариев ${selected.family} нет варианта ${orientation}`)
      if (fixture.policyId !== selected.policyId) {
        throw new Error(`В семействе сценариев ${selected.family} смешаны политики ${selected.policyId} и ${fixture.policyId}`)
      }
      return fixture
    })
    const runs = fixtures.map((fixture) => ({
      fixture,
      run: runPlaygroundLayout(selected.policyId, fixture.graph),
    }))
    comparison.replaceChildren(...runs.map(({fixture, run}) => comparisonArticle(fixture, run)))
    comparison.hidden = false
    singleView.hidden = true
    currentRun = runs[0]!.run
    resultOutput.textContent = pretty(Object.fromEntries(runs.map(({fixture, run}) => [fixture.expectedDirection, run.result])))
    diagnosticsOutput.textContent = pretty({
      status: "ok",
      policy: selected.policyId,
      comparison: runs.map(({fixture, run}) => successDiagnostics(run, fixture)),
      validation: "Стенд показывает результат публичной политики и не реализует отдельный валидатор раскладки.",
    })
    exportResult.disabled = false
    exportSvg.disabled = false
    setStatus("ok", "Сравнены RIGHT / DOWN")
    applyLayerVisibility()
  } catch (error) {
    diagnosticsOutput.textContent = pretty(errorDiagnostics(error))
    setStatus("error", "Не удалось сравнить раскладки")
  }
}

function comparisonArticle(fixture: PlaygroundFixture, run: PlaygroundRun): HTMLElement {
  const article = document.createElement("article")
  article.dataset.direction = fixture.expectedDirection
  const heading = document.createElement("h2")
  heading.textContent = `${formatDirection(fixture.expectedDirection)} · ${formatMetrics(run)}`
  const view = document.createElement("div")
  view.className = "svg-view"
  view.innerHTML = run.svg
  article.append(heading, view)
  return article
}

function resetFixture(): void {
  const fixture = getPlaygroundFixture(fixtureSelect.value || PLAYGROUND_FIXTURES[0]!.id)
  fixtureSelect.value = fixture.id
  fixtureDescription.textContent = `${fixture.description} Ожидаемое направление: ${formatDirection(fixture.expectedDirection)}.`
  inputEditor.value = pretty(fixture.graph)
  updatePolicyPresentation(fixture)
}

function resetAndRunFixture(): void {
  resetFixture()
  runEditedInput()
}

function updatePolicyPresentation(fixture: PlaygroundFixture): void {
  const policy = getPlaygroundPolicy(fixture.policyId)
  policyOutput.value = policy.label
  policyOutput.dataset.policyId = policy.id
  policyDescription.textContent = policy.description
}

function successDiagnostics(run: PlaygroundRun, fixture: PlaygroundFixture): unknown {
  const expectedDirection = fixture.expectedDirection
  return {
    status: "ok",
    policy: run.policyId,
    expectedDirection,
    actualDirection: run.result.direction,
    directionMatchesFixture: expectedDirection === run.result.direction,
    metrics: run.metrics,
    policyDiagnostics: run.policyDiagnostics,
    validation: "Публичная политика завершилась успешно. Стенд не запускал собственную раскладку, маршрутизацию или строгий валидатор.",
  }
}

function errorDiagnostics(error: unknown): unknown {
  return {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
    source: "публичная политика раскладки",
  }
}

function formatMetrics(run: PlaygroundRun): string {
  const metrics = run.metrics
  return [
    formatCount(metrics.nodeCount, ["нода", "ноды", "нод"]),
    formatCount(metrics.compoundCount, ["контейнер", "контейнера", "контейнеров"]),
    formatCount(metrics.portCount, ["порт", "порта", "портов"]),
    formatCount(metrics.edgeCount, ["связь", "связи", "связей"]),
    formatCount(metrics.bendCount, ["изгиб", "изгиба", "изгибов"]),
    formatCount(metrics.gatewayCount, ["шлюз", "шлюза", "шлюзов"]),
    `${formatDuration(metrics.durationMs)}`,
  ].join(" · ")
}

function formatCount(value: number, forms: readonly [string, string, string]): string {
  const lastTwo = Math.abs(value) % 100
  const last = lastTwo % 10
  const form = lastTwo >= 11 && lastTwo <= 14
    ? forms[2]
    : last === 1
      ? forms[0]
      : last >= 2 && last <= 4
        ? forms[1]
        : forms[2]
  return `${value} ${form}`
}

function formatDuration(value: number): string {
  return `${value.toFixed(2)} мс`
}

function formatDirection(direction: "RIGHT" | "DOWN"): string {
  return direction === "RIGHT" ? "Горизонтальная (RIGHT)" : "Вертикальная (DOWN)"
}

function applyLayerVisibility(): void {
  for (const checkbox of document.querySelectorAll<HTMLInputElement>("[data-layer-toggle]")) {
    const layer = checkbox.dataset.layerToggle
    if (layer === undefined) continue
    for (const element of document.querySelectorAll<SVGGElement>(
      `[data-layer="${layer}"], [data-layer-owner="${layer}"]`,
    )) {
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
  if (element === null) throw new Error(`Не найден элемент интерфейса стенда: ${selector}`)
  return element
}
