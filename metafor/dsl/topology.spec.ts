import { describe, expect, test } from "bun:test"

import { MetaFor, compileLocalTopologyFragment } from "./metafor.ts"

describe("compileLocalTopologyFragment", () => {
  test("собирает локальный topology-фрагмент из gravity одной meta", () => {
    const meta = MetaFor("local-topology")
      .fields((field) => ({
        enabled: field.boolean.required(true),
        mode: field.enum("card", "table").required("card"),
        rows: field.array.required<string>([]),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        <section>
          ${value.enabled && html`
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
    
    // NodeLogical -> axion (не fuzzy), NodeCondition -> fuzzy (только state/enum)
    expect(objects.filter((object) => object.kind === "axion")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "fuzzy")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "macho")).toHaveLength(1)
    expect(objects.filter((object) => object.kind === "wimp")).toHaveLength(4)
    expect(Object.values(fragment.placements).every((placement) => /^\/[wfma]:/.test(placement.address))).toBe(true)
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

  test("не превращает presentation carriers в topology-объекты", () => {
    const meta = MetaFor("carriers")
      .fields((field) => ({
        enabled: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        <div class="layout">
          <span>label</span>
          ${value.enabled && html`
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

    // NodeLogical -> axion, NodeCondition -> fuzzy (но boolean поле теперь запрещено)
    // Этот тест проверяет, что только meta-for становятся wimp
    expect(Object.values(fragment.objects).filter((object) => object.kind === "wimp")).toHaveLength(1)
    // NodeLogical с boolean теперь валиден как axion (не требует branch-choice)
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
})
