import {describe, expect, test} from "bun:test"

describe("Visual playground nested navigation", () => {
  test("navigates complete layouts instead of enumerating entity pages", async () => {
    const [page, client, server] = await Promise.all([
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./client.ts", import.meta.url)).text(),
      Bun.file(new URL("./server.ts", import.meta.url)).text(),
    ])

    expect(page).toContain("<h1>Visual layouts</h1>")
    expect(page).toContain('id="outside-in-canvas"')
    expect(client).toContain('layoutSection.textContent = "Layouts"')
    expect(client).toContain("for (const layout of Visual)")
    expect(client).not.toContain("for (const component of Visual)")
    expect(client).toContain("link.dataset.status = layout.status")
    expect(client).toContain("`#/${OutsideIn.slug}`")
    expect(client).not.toContain("minimumReadableDiameterPx")
    expect(page).not.toContain('id="inner"')
    expect(page).not.toContain('id="radius"')
    expect(page).not.toContain('id="gap"')
    expect(page).not.toContain("Inner diameter")
    expect(page).not.toContain("Marker radius")
    expect(page).not.toContain("Orbit gap")
    expect(client).not.toContain("layout.rootInnerDiameterMm =")
    expect(client).not.toContain("layout.rootSphereRadiusMm =")
    expect(client).not.toContain("layout.orbitEdgeGapMm =")
    expect(client).not.toContain("readStoredTorusDefaults(localStorage)")
    expect(page).toContain("main.layout-mode #visual-visibility-controls")
    expect(client).toContain(
      'app.classList.toggle("layout-mode", selectedLayout !== undefined)',
    )
    expect(page).toContain("@media (max-width: 600px)")
    expect(page).toContain("grid-template-rows: auto minmax(0, 1fr)")
    expect(server).toContain("development: {hmr: false}")
  })

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
    expect(page).toContain(
      "main.section-tabs-mode #fields-analysis-stage",
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
    expect(client).toContain(
      '{href: "#/edges/hermite", label: "Hermite · балка"}',
    )
    expect(client).toContain("lab.showOverview()")
    expect(client).toContain('parent: "State Graph"')
    expect(client).toContain(
      'tabs: [{href: "#/state-graph", label: "Ветки"}]',
    )
    expect(client).toContain('parent: "Fields"')
    expect(client).toContain(
      'tabs: [{href: "#/analysis-fields", label: "Псевдосфера"}]',
    )
    expect(client).toContain('fieldsAnalysisLink.textContent = "Fields"')
    expect(client).not.toContain('showSectionTabs("Form skins", slug)')
    expect(client).toContain("showSectionTabs(slug)")
    expect(client).toContain("hideSectionTabs()")
  })
})
