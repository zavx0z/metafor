import { describe, expect, test } from "bun:test"
import { MetaFor } from "./metafor.ts"
import {parseMatter} from "./matter.ts"

describe("matter validation", () => {
  test("parseMatter сохраняет пустые ветви условия", () => {
    const emptyThen = parseMatter(
      ({state, html}) => html`${state === "ready"
        ? html``
        : html`<meta-for src="demo/fallback" />`}`,
      {},
    )
    expect(emptyThen).toEqual([{
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === \"ready\""},
      children: [{edgeSlot: "else", particle: {kind: "wimp", src: "demo/fallback"}}],
    }])

    const emptyElse = parseMatter(
      ({state, html}) => html`${state === "ready"
        ? html`<meta-for src="demo/primary" /><meta-for src="demo/secondary" />`
        : html``}`,
      {},
    )
    expect(emptyElse).toEqual([{
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === \"ready\""},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: "demo/primary"}},
        {edgeSlot: "then", particle: {kind: "wimp", src: "demo/secondary"}},
      ],
    }])
  })

  test("parseMatter сохраняет одиночные then и else", () => {
    const matter = parseMatter(
      ({state, html}) => html`${state === "ready"
        ? html`<meta-for src="demo/primary" />`
        : html`<meta-for src="demo/fallback" />`}`,
      {},
    )

    expect(matter).toEqual([{
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === \"ready\""},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: "demo/primary"}},
        {edgeSlot: "else", particle: {kind: "wimp", src: "demo/fallback"}},
      ],
    }])
  })

  test("parseMatter сохраняет все узлы многосоставных then и else", () => {
    const matter = parseMatter(
      ({state, html}) => html`${state === "ready"
        ? html`<meta-for src="demo/one" /><meta-for src="demo/two" />`
        : html`<meta-for src="demo/three" /><meta-for src="demo/four" />`}`,
      {},
    )

    expect(matter).toEqual([{
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === \"ready\""},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: "demo/one"}},
        {edgeSlot: "then", particle: {kind: "wimp", src: "demo/two"}},
        {edgeSlot: "else", particle: {kind: "wimp", src: "demo/three"}},
        {edgeSlot: "else", particle: {kind: "wimp", src: "demo/four"}},
      ],
    }])
  })

  test("нормализует template field paths на границе DSL", () => {
    const schema = MetaFor("normalized-matter")
      .fields((field) => ({
        mode: field.enum("card", "table").required("card"),
        title: field.string.required("draft"),
      }))
      .superposition({ idle: null })
      .mass(() => ({}))
      .energy()
      .processes()
      .reactions()
      .matter(
        ({ state, value, html }) => html`
          ${state === "idle"
            ? html`<meta-for src="demo/${value.mode}" fields=${{ title: value.title }} />`
            : html`<meta-for src="demo/table" />`}
        `,
      )
      .bulk()

    const condition = schema.matter?.find((particle) => particle.kind === "axion") as any
    const dynamicMeta = condition.children.find((child: any) => child.particle.kind === "fuzzy" && child.particle.fuzzyKind === "dynamic-meta").particle
    const dynamicChild = dynamicMeta.children[0].particle

    expect(condition.predicateBinding.data).toBe("/state")
    expect(dynamicMeta.predicateBinding.data).toBe("mode")
    expect(dynamicChild.fieldsBinding.data).toBe("title")
  })

  test("проецирует отдельные Mass и Energy bindings дочернего Atom", () => {
    const schema = MetaFor("matter-runtime-bindings")
      .fields((field) => ({title: field.string.required("draft")}))
      .superposition({idle: null})
      .mass((mass) => ({cache: mass.json()}))
      .energy<{socket: WebSocket}>()
      .processes()
      .reactions()
      .matter(({mass, energy, html}) => html`
        <meta-for
          src="demo/child"
          mass=${{cache: mass.cache}}
          energy=${{socket: energy.socket}}
        />
      `)
      .bulk()

    expect(schema.matter).toEqual([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {data: "/mass/cache", expr: "{ cache: _[0] }", directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]}},
      energyBinding: {data: "/energy/socket", expr: "{ socket: _[0] }"},
    }])
  })

  test("поддерживает прямые aliases полных Mass и Energy stores", () => {
    const schema = MetaFor("matter-runtime-aliases")
      .fields(() => ({}))
      .superposition({idle: null})
      .mass((mass) => ({cache: mass.json()}))
      .energy<{socket: WebSocket}>()
      .processes()
      .reactions()
      .matter(({mass, energy, html}) => html`<meta-for src="demo/child" mass=${mass} energy=${energy} />`)
      .bulk()

    expect(schema.matter).toEqual([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy"},
    }])
  })

  test("нормализует именованное direct Mass mapping без expression semantics", () => {
    const schema = MetaFor("matter-renamed-mass")
      .fields(() => ({}))
      .superposition({idle: null})
      .mass((mass) => ({source: mass.json(), other: mass.binary()}))
      .energy()
      .processes()
      .reactions()
      .matter(({mass, html}) => html`<meta-for src="demo/child" mass=${{target: mass.source, alternate: mass.other}} />`)
      .bulk()

    expect((schema.matter?.[0] as any).massBinding).toEqual({
      data: ["/mass/source", "/mass/other"],
      expr: "{ target: _[0], alternate: _[1] }",
      directMass: {kind: "keys", entries: [
        {target: "target", source: "source"},
        {target: "alternate", source: "other"},
      ]},
    })
  })

  test("rejects computed Mass bindings that are not a direct mapping", () => {
    expect(() => MetaFor("matter-computed-mass")
      .fields(() => ({}))
      .superposition({idle: null})
      .mass((mass) => ({cache: mass.json()}))
      .energy()
      .processes()
      .reactions()
      .matter(({mass, html}) => html`<meta-for src="demo/child" mass=${{cache: `${mass.cache}`}} />`)
      .bulk(),
    ).toThrow("mass binding must be a direct whole or declared-key projection")

    expect(() => MetaFor("matter-static-mass")
      .fields(() => ({}))
      .superposition({idle: null})
      .mass(() => ({}))
      .energy()
      .processes()
      .reactions()
      .matter(({html}) => html`<meta-for src="demo/child" mass=${{cache: "value"} as never} />`)
      .bulk(),
    ).toThrow("mass binding must be a direct whole or declared-key projection")
  })

  test("запрещает смешивать Mass/Energy paths и помещать функции в runtime binding", () => {
    expect(() =>
      MetaFor("invalid-runtime-binding-domain")
        .fields(() => ({}))
        .superposition({idle: null})
        .mass((mass) => ({cache: mass.json()}))
        .energy<{socket: WebSocket}>()
        .processes()
        .reactions()
        .matter(({energy, html}) => html`<meta-for src="demo/child" mass=${{socket: energy.socket}} />`)
        .bulk(),
    ).toThrow("mass binding dependency \"/energy/socket\" must use /mass")

    expect(() =>
      MetaFor("invalid-runtime-binding-function")
        .fields(() => ({}))
        .superposition({idle: null})
        .mass(() => ({}))
        .energy<{socket: WebSocket}>()
        .processes()
        .reactions()
        .matter(({energy, html}) => html`<meta-for src="demo/child" energy=${{socket: () => energy.socket}} />`)
        .bulk(),
    ).toThrow("energy binding must not create or call executable resources")
  })

  test("разводит Axion по state, Fuzzy по dynamic enum src и Macho по array", () => {
    expect(() =>
      MetaFor("valid-matter")
        .fields((field) => ({
          mode: field.enum("card", "table").required("card"),
          branches: field.array.required([1]),
        }))
        .superposition({
          ожидание: {
            готово: { mode: { notEq: "card" } },
          },
          готово: null,
        })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(
          ({ state, value, html }) => html`
            ${state === "готово" && html`<meta-for src="demo/panel" />`}
            <meta-for src="demo/${value.mode}" />
            ${value.branches.map((branch) => html`<meta-for src="demo/branch" fields=${{ branch }} />`)}
          `,
        )
        .bulk(),
    ).not.toThrow()
  })

  test("разрешает direct dynamic src по optional enum без null-guard", () => {
    expect(() =>
      MetaFor("valid-direct-enum-src")
        .fields((field) => ({
          operation: field.enum("clone", "init").optional({ label: "Тип операции" }),
          args: field.string.optional({ label: "Аргументы" }),
        }))
        .superposition({})
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`<meta-for src="demo/${value.operation}" fields=${{ args: value.args }} />`)
        .bulk(),
    ).not.toThrow()
  })

  test("parseMatter сохраняет строковые литералы вычисляемого src", () => {
    const matter = parseMatter(
      ({value, html}) => html`<meta-for src="${value.mode === "value.mode" ? "demo/selected" : "demo/fallback"}" />`,
      {mode: {type: "enum", values: ["value.mode", "other"]}},
    )

    expect(matter).toEqual([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {
        data: "mode",
        expr: '${_[0] === "value.mode" ? "demo/selected" : "demo/fallback"}',
      },
      children: [
        {edgeSlot: "branch", particle: {kind: "wimp", src: "demo/selected"}},
        {edgeSlot: "branch", particle: {kind: "wimp", src: "demo/fallback"}},
      ],
    }])
  })

  test("parseMatter не считает имя внутри строки dependency вычисляемого fields", () => {
    const matter = parseMatter(
      ({value, html}) => html`<meta-for src="demo/child" fields=${{mode: value.mode, label: "value.mode"}} />`,
      {mode: {type: "enum", values: ["one", "two"]}},
    )

    expect(matter).toEqual([{
      kind: "wimp",
      src: "demo/child",
      fieldsBinding: {
        data: "mode",
        expr: '{ mode: _[0], label: "value.mode" }',
      },
    }])
  })

  test("parseMatter отклоняет третий сегмент каждого вычисленного src", () => {
    expect(() => parseMatter(
      ({value, html}) => html`<meta-for src="demo/${value.mode}" />`,
      {mode: {type: "enum", values: ["one", "base/two"]}},
    )).toThrow(
      'Matter violation at "matter[0].src[1]": src "demo/base/two" is not a valid hub address.',
    )
  })

  test("запрещает HTML элементы в matter", () => {
    expect(() =>
      MetaFor("invalid-html")
        .fields((field) => ({
          name: field.string.required("meta"),
        }))
        .superposition({ idle: null })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`<div>${value.name}</div>`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-html.matter[0]": HTML element <div> is not allowed in matter.',
    )
  })

  test("запрещает текстовые узлы в matter", () => {
    expect(() =>
      MetaFor("invalid-text")
        .fields((field) => ({
          name: field.string.required("meta"),
        }))
        .superposition({ idle: null })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`${value.name}`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-text.matter[0]": text nodes are not allowed in matter.',
    )
  })

  test("запрещает ветвление по обычному string полю", () => {
    expect(() =>
      MetaFor("invalid-string-branch")
        .fields((field) => ({
          error: field.string.optional({ label: "Ошибка" }),
        }))
        .superposition({ idle: null })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`${value.error && html`<meta-for src="demo/error" />`}`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-string-branch.matter[0]": logical branch uses field "error" of type "string".',
    )
  })

  test("запрещает enum в conditional/logical branch", () => {
    expect(() =>
      MetaFor("invalid-enum-null-guard")
        .fields((field) => ({
          operation: field.enum("clone", "init").optional({ label: "Тип операции" }),
        }))
        .superposition({})
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`${value.operation && html`<meta-for src="demo/${value.operation}" />`}`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-enum-null-guard.matter[0]": logical branch uses field "operation" of type "enum".',
    )
  })

  test("запрещает ветвление по mass", () => {
    expect(() =>
      MetaFor("invalid-mass-branch")
        .fields((field) => ({
          mode: field.enum("idle", "done").required("idle"),
        }))
        .superposition({ idle: null })
        .mass((mass) => ({session: mass.json()}))
        .energy()
        .processes()
        .reactions()
        .matter(
          ({ mass, html }) => html`${mass.session ? html`<meta-for src="demo/panel" />` : html`<meta-for src="demo/fallback" />`}`,
        )
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-mass-branch.matter[0]": conditional branch uses mass path "/mass/session".',
    )
  })

  test("запрещает map по обычному полю вместо array", () => {
    expect(() =>
      MetaFor("invalid-map-basis")
        .fields((field) => ({
          title: field.string.required("hello"),
        }))
        .superposition({ idle: null })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) =>
          html`${(value.title as unknown as string[]).map((item: string) => html`<meta-for src="demo/item" fields=${{ item }} />`)}`
        )
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-map-basis.matter[0]": map branch uses field "title" of type "string".',
    )
  })

  test("запрещает dynamic src не по enum полю", () => {
    expect(() =>
      MetaFor("invalid-dynamic-src")
        .fields((field) => ({
          target: field.string.required("demo/error"),
        }))
        .superposition({ idle: null })
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter(({ value, html }) => html`<meta-for src="${value.target}" />`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-dynamic-src.matter[0].src": dynamic src uses field "target" of type "string".',
    )
  })
})
