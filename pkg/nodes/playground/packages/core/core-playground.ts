import {createCoreRuntimeScenario} from "./core-runtime-scenario.ts"

const scenario = createCoreRuntimeScenario()
const status = requiredElement("core-status", HTMLOutputElement)
const snapshot = requiredElement("core-snapshot", HTMLPreElement)
const documentView = requiredElement("core-document", HTMLPreElement)
const events = requiredElement("core-events", HTMLPreElement)

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "core"

requiredElement("gain", HTMLButtonElement).addEventListener("click", () => {
  const gain = scenario.tree.parameter("source", "gain")
  scenario.setGain(Number(gain.value) + 1)
  render()
})
requiredElement("add-parameter", HTMLButtonElement).addEventListener("click", () => {
  scenario.addParameter()
  render()
})
requiredElement("remove-parameter", HTMLButtonElement).addEventListener("click", () => {
  scenario.removeParameter()
  render()
})

render()
document.documentElement.dataset.nodesPlayground = "ready"

function render(): void {
  status.value = `revision ${scenario.tree.revision} · topology ${scenario.tree.topologyRevision} · Parameter ${scenario.tree.nodes[0]?.parameters?.length ?? 0}`
  snapshot.textContent = JSON.stringify(scenario.snapshot(), null, 2)
  documentView.textContent = JSON.stringify(scenario.document(), null, 2)
  events.textContent = JSON.stringify(scenario.changes, null, 2)
  document.documentElement.dataset.coreRevision = String(scenario.tree.revision)
  document.documentElement.dataset.coreTopologyRevision = String(scenario.tree.topologyRevision)
  document.documentElement.dataset.coreParameterCount = String(scenario.tree.nodes[0]?.parameters?.length ?? 0)
}

function requiredElement<T extends HTMLElement>(
  id: string,
  constructor: abstract new (...args: never[]) => T,
): T {
  const element = document.getElementById(id)
  if (!(element instanceof constructor)) throw new Error(`Core playground element is missing: ${id}`)
  return element
}
