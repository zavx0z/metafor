import {describe, expect, test} from "bun:test"

describe("Visual playground nested navigation", () => {
  test("navigates complete layouts instead of enumerating entity pages", async () => {
    const [page, client, server] = await Promise.all([
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./client.ts", import.meta.url)).text(),
      Bun.file(new URL("./server.ts", import.meta.url)).text(),
    ])

    expect(page).toContain("<h1>Visual layouts</h1>")
    expect(page).toContain('id="layout-canvas"')
    expect(client).toContain('layoutSection.textContent = "Layouts"')
    expect(client).toContain("for (const layout of Visual)")
    expect(client).not.toContain("for (const component of Visual)")
    expect(client).toContain("link.dataset.status = layout.status")
    expect(client).toContain("`#/${OutsideIn.slug}`")
    expect(client).toContain("selectedLayout.buildScene")
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
    expect(client).not.toContain("VisualStory")
    expect(client).not.toContain("STORY_SLUG")
    expect(page).not.toContain('id="story-stage"')
    expect(page).not.toContain('id="story-controls"')
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
      "main.section-tabs-mode #state-graph-activity-stage",
    )
    expect(page).toContain(
      "main.section-tabs-mode #state-graph-process-stage",
    )
    expect(page).toContain(
      "main.section-tabs-mode #force-stories-stage",
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
      '{href: "#/state-graph", label: "Ветки"}',
    )
    expect(client).toContain(
      '{href: `#/${STATE_GRAPH_FIELDS_SLUG}`, label: "Поля"}',
    )
    expect(client).toContain(
      '{href: `#/${STATE_GRAPH_ACTIVITY_SLUG}`, label: "Активность"}',
    )
    expect(client).toContain(
      '{href: `#/${STATE_GRAPH_PROCESS_SLUG}`, label: "Процесс"}',
    )
    expect(client).toContain(
      "viewport.applyVisualManifestPatch(stand.visual)",
    )
    expect(page).toContain(
      '<div id="state-graph-fields-controls" hidden>',
    )
    expect(page).toContain(
      '<pre id="state-graph-fields-json"></pre>',
    )
    expect(page).toContain(
      '<section id="state-graph-activity-stage" hidden>',
    )
    expect(page).toContain(
      '<h2>Текущее состояние</h2>',
    )
    expect(page).toContain(
      '<h2>Без текущего состояния</h2>',
    )
    expect(client).toContain(
      "createStateGraphActivityLab(",
    )
    expect(page).toContain(
      '<section id="state-graph-process-stage" hidden></section>',
    )
    expect(client).toContain(
      "createStateGraphProcessLab(stateGraphProcessStage)",
    )
    expect(client).toContain('parent: "Fields"')
    expect(client).toContain(
      '{href: "#/analysis-fields", label: "Псевдосфера"}',
    )
    expect(client).toContain(
      '{href: "#/analysis-fields/circle", label: "Одна окружность"}',
    )
    expect(client).toContain(
      '{href: "#/analysis-fields/growth-rings", label: "Кольца роста"}',
    )
    expect(client).toContain(
      '{href: "#/analysis-fields/sunflower", label: "Sunflower"}',
    )
    expect(client).toContain(
      '{href: "#/analysis-fields/hex-spiral", label: "Hex spiral"}',
    )
    expect(client).toContain('fieldsAnalysisLink.textContent = "Fields"')
    expect(client).not.toContain('showSectionTabs("Form skins", slug)')
    expect(client).toContain("showSectionTabs(slug)")
    expect(client).toContain("hideSectionTabs()")
  })

  test("routes eight private Force Story tabs without exporting entity navigation", async () => {
    const [page, client, stories, packageJson] = await Promise.all([
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./client.ts", import.meta.url)).text(),
      Bun.file(new URL("./ForceStories.ts", import.meta.url)).text(),
      Bun.file(new URL("../package.json", import.meta.url)).text(),
    ])

    expect(page).toContain('id="force-stories-stage"')
    expect(stories).toContain('FORCE_STORIES_SLUG = "force-stories"')
    expect(client).toContain('forceSection.textContent = "Force"')
    expect(client).toContain('forceStoriesLink.textContent = "Force Stories"')
    expect(client).toContain("const forceStoryTabs: readonly SectionTab[]")
    expect(client).toContain("ForceStories.map((story) => ({")
    expect(client).toContain('parent: "Force Stories"')
    expect(client).toContain("forceStoryRouteSlug(story.part)")
    expect(stories).toContain('"w+": "w-plus"')
    expect(stories).toContain('"w-": "w-minus"')
    expect(stories).toContain('id: "top"')
    expect(stories).toContain('id: "side"')
    expect(page).toContain(".force-story-views")
    expect(page).toContain(".force-story-header")
    expect(page).toContain(".force-story-sleeves")
    expect(page).not.toContain(".force-story-shared-state")
    expect(client).toContain("applyForceStoriesPage()")
    expect(client).toContain("lab.show(part)")
    expect(client).toContain("showSectionTabs(slug)")
    expect(packageJson).not.toContain("playground/ForceStories")
    expect(packageJson).not.toContain("force-stories")
  })
})
