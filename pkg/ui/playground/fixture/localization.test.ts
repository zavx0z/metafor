import {describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const visibleOwnerRoots = [
  "pkg/ui/playground/fixture",
  "pkg/ui/components/playground",
  "pkg/ui/elements/playground",
  "pkg/nodes/playground/packages/ui",
] as const

const forbiddenVisiblePhrases = [
  "Production-компонент",
  "Production-элемент",
  "Production Socket",
  "Production Pane",
  "одну story",
  "состояние story",
  'label: "Story"',
  "Node component system",
  "Data Processing",
  "Scalar Math",
  'label: "Operation"',
  'label: "Add"',
  'label: "Multiply"',
  'label: "Factor"',
  'label: "Clamp"',
  'blenderNode("transform", "Transform"',
  'label: "Translation"',
  'label: "Rotation"',
  'label: "Distribution"',
  'label: "Base Color"',
  'blenderNode("asset", "Asset Input"',
  'label: "Name"',
  'label: "Object"',
  'label: "Image"',
  'blenderNode("matrix", "Matrix Math"',
  'label: "Status"',
  'value: "Identity"',
  'blenderNode("collapsed", "Compact Mix"',
  'socket("result", "Result"',
  'socket("mixed", "Result"',
  'label: "Input · ordinary"',
  'label: "Output · selected"',
  '"input / output / bidirectional · selected / ordinary"',
  '"типов без Fields и Parameters"',
  "UI component",
  "Основной текст production Typography",
  "public production export",
  "disabled-маршрутом",
  "retained content",
  "Retained parent",
  "Hit и keyboard state",
  "WebGPU draw pass",
  "Lazy production import",
  "// Загрузка story…",
  'comparison: "Blender comparison"',
  'title: "BLENDER COMPARISON"',
  'cell(surface, cx, cy, cw, ch, "header"',
  'cell(surface, cx, cy, cw, ch, "footer"',
] as const

const requiredLocalizedPhrases = [
  "Рабочий компонент, текущие параметры и копируемый TypeScript используют один сценарий.",
  "Рабочий компонент, параметры и TypeScript используют один сценарий.",
  "Рабочий элемент, параметры и TypeScript используют один сценарий.",
  "Рабочий Socket, параметры и TypeScript используют одно состояние сценария.",
  'label: "Сценарий"',
  "Система компонентов нод",
  "Обработка данных",
  "Скалярная математика",
  'label: "Операция"',
  'label: "Коэффициент"',
  'label: "Ограничение"',
] as const

describe("Workbench visible localization", () => {
  test("scans every playground-owned visible source and rejects known English labels", async () => {
    const sources = await visibleSources()
    expect(new Set(sources.map(({owner}) => owner))).toEqual(new Set(visibleOwnerRoots))
    const combined = sources.map(({path, source}) => `// ${path}\n${source}`).join("\n")
    for (const phrase of forbiddenVisiblePhrases) expect(combined).not.toContain(phrase)
    for (const phrase of requiredLocalizedPhrases) expect(combined).toContain(phrase)
  })
})

async function visibleSources(): Promise<readonly Readonly<{owner: string; path: string; source: string}>[]> {
  const sources: Readonly<{owner: string; path: string; source: string}>[] = []
  const glob = new Bun.Glob("**/*.ts")
  for (const owner of visibleOwnerRoots) {
    const directory = join(repositoryRoot, owner)
    for await (const path of glob.scan({cwd: directory, onlyFiles: true})) {
      if (path.endsWith(".test.ts") || path === "server.ts") continue
      sources.push({owner, path: `${owner}/${path}`, source: await Bun.file(join(directory, path)).text()})
    }
  }
  return sources
}
