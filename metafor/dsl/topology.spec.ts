import { describe, expect, test } from "bun:test"

import { MetaFor, compileLocalTopologyFragment } from "./metafor.ts"

describe("compileLocalTopologyFragment", () => {
  test("собирает локальный topology-фрагмент из gravity одной meta", () => {
    const meta = MetaFor("local-topology")
      .fields((field) => ({
        mode: field.enum("card", "table").required("card"),
        rows: field.array.required<string>([]),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, state, html }) => html`
        <section>
          ${state === "idle" && html`
            <meta-for src="zavx0z/header"></meta-for>
          `}
          ${value.mode === "card"
            ? html`<meta-for src="zavx0z/card"></meta-for>`
            : html`<meta-for src="zavx0z/table"></meta-for>`}
          ${value.rows.map((row) => html`
            <div>
              <meta-for src="zavx0z/row"></meta-for>
            </div>
          `)}
        </section>
      `)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    const objects = Object.values(fragment.objects)

    expect(fragment.meta).toBe("local-topology")
    expect(fragment.roots.length).toBeGreaterThan(0)

    // NodeLogical -> axion, NodeCondition -> fuzzy, NodeMap -> macho
    expect(objects.filter((object) => object.kind === "axion")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "fuzzy")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "macho")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "wimp")).toHaveLength(4)
    expect(Object.values(fragment.placements).every((placement) => /^\/[wfma]:/.test(placement.address))).toBe(true)
    expect(fragment.entanglementSeeds.every((seed) => seed.kind !== "macho")).toBe(true)
    expect(fragment.references.map((reference) => reference.src)).toEqual([
      "zavx0z/header",
      "zavx0z/card",
      "zavx0z/table",
      "zavx0z/row",
    ])
  })

  test("разворачивает enum-driven meta.src в Fuzzy и конечный набор WIMP", () => {
    const meta = MetaFor("enum-src")
      .fields((field) => ({
        operation: field.enum("start", "work", "history").required("start"),
        args: field.string.required(""),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        ${value.operation && html`
          <meta-for src=${`zavx0z/git-${value.operation}`}></meta-for>
        `}
      `)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    const fuzzy = Object.values(fragment.objects).find(
      (object) => object.kind === "fuzzy" && object.selector.kind === "enum",
    )
    const enumWimps = Object.values(fragment.objects).filter(
      (object) => object.kind === "wimp" && object.srcMode === "enum",
    )

    expect(fuzzy).toBeDefined()
    if (!fuzzy || fuzzy.kind !== "fuzzy" || fuzzy.selector.kind !== "enum") {
      throw new Error("enum fuzzy не собран")
    }

    expect(fuzzy.selector.field).toBe("operation")
    expect(fuzzy.selector.values).toEqual(["start", "work", "history"])
    expect(enumWimps).toHaveLength(3)
    expect(fragment.references.map((reference) => reference.src).sort()).toEqual([
      "zavx0z/git-history",
      "zavx0z/git-start",
      "zavx0z/git-work",
    ])
    expect(enumWimps.map((object) => (object.kind === "wimp" ? object.variant?.value : undefined)).sort()).toEqual(["history", "start", "work"])
    expect(Object.values(fragment.placements).some((placement) => placement.relation === "branch")).toBe(true)
  })

  test("разрешает state как отдельный branch-choice basis для Fuzzy", () => {
    const meta = MetaFor("state-fuzzy")
      .fields((field) => ({
        ready: field.boolean.required(true),
      }))
      .superposition({
        idle: { loading: { ready: { eq: true } } },
        loading: null,
      })
      .mass()
      .processes()
      .reactions()
      .gravity(({ state, html }) => html`
        ${state === "loading"
          ? html`<meta-for src="zavx0z/spinner"></meta-for>`
          : html`<meta-for src="zavx0z/content"></meta-for>`}
      `)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    const fuzzy = Object.values(fragment.objects).find(
      (object) => object.kind === "fuzzy" && object.selector.kind === "condition",
    )

    expect(fuzzy).toBeDefined()
    if (!fuzzy || fuzzy.kind !== "fuzzy" || fuzzy.selector.kind !== "condition") {
      throw new Error("state fuzzy не собран")
    }

    expect(fuzzy.selector.dataPaths).toEqual(["/state"])
    expect(fragment.entanglementSeeds.some((seed) => seed.kind === "fuzzy" && seed.dataPaths[0] === "/state")).toBe(true)
    expect(fragment.references.map((reference) => reference.src).sort()).toEqual([
      "zavx0z/content",
      "zavx0z/spinner",
    ])
  })

  test("не превращает presentation carriers в topology-объекты", () => {
    const meta = MetaFor("carriers")
      .fields((field) => ({
        mode: field.enum("detail", "compact").required("detail"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        <div class="layout">
          <span>label</span>
          ${value.mode === "detail" && html`
            <section>
              <div>
                <meta-for src="zavx0z/child"></meta-for>
              </div>
            </section>
          `}
        </div>
      `)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)

    // Этот тест проверяет, что только meta-for становятся wimp
    expect(Object.values(fragment.objects).filter((object) => object.kind === "wimp")).toHaveLength(1)
    // NodeLogical с enum basis валиден как axion, потому что basis принадлежит topology-контракту
    expect(Object.values(fragment.objects).filter((object) => object.kind === "axion")).toHaveLength(1)
  })

  test("выбрасывает ошибку для meta.src, который зависит не от enum topology-field", () => {
    const meta = MetaFor("dynamic-src")
      .fields((field) => ({
        src: field.string.required("zavx0z/git-start"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        <meta-for src=${`zavx0z/${value.src}`}></meta-for>
      `)
      .bulk()

    expect(() => compileLocalTopologyFragment(meta)).toThrow(/не статический enum topology-field/)
  })

  test("выбрасывает ошибку если NodeCondition смешивает enum с обычным boolean field", () => {
    const meta = MetaFor("invalid-condition-boolean")
      .fields((field) => ({
        mode: field.enum("card", "table").required("card"),
        enabled: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        ${value.mode === "card" && value.enabled
          ? html`<meta-for src="zavx0z/card"></meta-for>`
          : html`<meta-for src="zavx0z/table"></meta-for>`}
      `)
      .bulk()

    expect(() => compileLocalTopologyFragment(meta)).toThrow(/enabled/)
  })

  test("выбрасывает ошибку если NodeCondition использует нераспознанный basis вне state|enum", () => {
    const meta = MetaFor("invalid-condition-mass")
      .fields((field) => ({
        mode: field.enum("idle", "work").required("idle"),
      }))
      .superposition({
        idle: { work: { mode: { eq: "work" } } },
        work: null,
      })
      .mass({
        session: {
          ready: true,
        },
      })
      .processes()
      .reactions()
      .gravity(({ state, mass, html }) => html`
        ${state === "idle" && mass.session
          ? html`<meta-for src="zavx0z/idle"></meta-for>`
          : html`<meta-for src="zavx0z/work"></meta-for>`}
      `)
      .bulk()

    expect(() => compileLocalTopologyFragment(meta)).toThrow(/\/mass\/session/)
  })

  test("выбрасывает ошибку если NodeLogical использует ordinary number basis", () => {
    const meta = MetaFor("invalid-logical-number")
      .fields((field) => ({
        value: field.number.required(0),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Value</div>`}`)
      .bulk()

    expect(() => compileLocalTopologyFragment(meta)).toThrow(/NodeLogical/)
  })
})
