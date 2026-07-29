import {describe, expect, test} from "bun:test"

describe("Visual playground nested navigation", () => {
  test("renders tabs for pages nested under the selected Analysis entity", async () => {
    const [page, client] = await Promise.all([
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./client.ts", import.meta.url)).text(),
    ])

    expect(page).toContain('id="section-tabs"')
    expect(page).toContain('aria-label="Вложенные страницы раздела"')
    expect(page).toContain(
      "main.section-tabs-mode #state-graph-stage",
    )
    expect(client).toContain('parent: "Torus"')
    expect(client).toContain(
      'tabs: [{href: "#/analysis-torus", label: "Геометрия"}]',
    )
    expect(client).toContain('parent: "Edges"')
    expect(client).toContain(
      '{href: "#/edges", label: "Все примеры"}',
    )
    expect(client).toContain(
      '{href: "#/edges/composite", label: "Составная экспериментальная"}',
    )
    expect(client).toContain(
      '{href: "#/edges/source-sink", label: "Источник → сток"}',
    )
    expect(client).toContain("lab.showOverview()")
    expect(client).toContain('parent: "State Graph"')
    expect(client).toContain(
      'tabs: [{href: "#/state-graph", label: "Ветки"}]',
    )
    expect(client).not.toContain('showSectionTabs("Form skins", slug)')
    expect(client).toContain("showSectionTabs(slug)")
    expect(client).toContain("hideSectionTabs()")
  })
})
