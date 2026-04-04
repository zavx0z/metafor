import { describe, expect, test } from "bun:test"
import { MetaFor } from "./metafor.ts"

describe("matter validation", () => {
  test("разрешает topology в matter только через state, enum и array", () => {
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
        .mass({})
        .processes()
        .reactions()
        .matter(
          ({ state, value, html }) => html`
            ${state === "готово" && html`<meta-for src="demo/panel" />`}
            ${value.mode === "card" ? html`<meta-for src="demo/card" />` : html`<meta-for src="demo/table" />`}
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
        .mass({})
        .processes()
        .reactions()
        .matter(({ value, html }) => html`<meta-for src="demo/${value.operation}" fields=${{ args: value.args }} />`)
        .bulk(),
    ).not.toThrow()
  })

  test("запрещает HTML элементы в matter", () => {
    expect(() =>
      MetaFor("invalid-html")
        .fields((field) => ({
          name: field.string.required("meta"),
        }))
        .superposition({ idle: null })
        .mass({})
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
        .mass({})
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
        .mass({})
        .processes()
        .reactions()
        .matter(({ value, html }) => html`${value.error && html`<meta-for src="demo/error" />`}`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-string-branch.matter[0]": logical branch uses field "error" of type "string".',
    )
  })

  test("запрещает redundant null-guard вокруг dynamic enum src", () => {
    expect(() =>
      MetaFor("invalid-enum-null-guard")
        .fields((field) => ({
          operation: field.enum("clone", "init").optional({ label: "Тип операции" }),
        }))
        .superposition({})
        .mass({})
        .processes()
        .reactions()
        .matter(({ value, html }) => html`${value.operation && html`<meta-for src="demo/${value.operation}" />`}`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-enum-null-guard.matter[0]": enum field "operation" must not be used as a null-guard for its own dynamic src.',
    )
  })

  test("запрещает ветвление по mass", () => {
    expect(() =>
      MetaFor("invalid-mass-branch")
        .fields((field) => ({
          mode: field.enum("idle", "done").required("idle"),
        }))
        .superposition({ idle: null })
        .mass({
          session: {
            active: true,
          },
        })
        .processes()
        .reactions()
        .matter(
          ({ mass, html }) => html`${mass.session.active ? html`<meta-for src="demo/panel" />` : html`<meta-for src="demo/fallback" />`}`,
        )
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-mass-branch.matter[0]": conditional branch uses mass path "/mass/session/active".',
    )
  })

  test("запрещает map по обычному полю вместо array", () => {
    expect(() =>
      MetaFor("invalid-map-basis")
        .fields((field) => ({
          title: field.string.required("hello"),
        }))
        .superposition({ idle: null })
        .mass({})
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
        .mass({})
        .processes()
        .reactions()
        .matter(({ value, html }) => html`<meta-for src="${value.target}" />`)
        .bulk(),
    ).toThrow(
      'Matter violation at "invalid-dynamic-src.matter[0].src": dynamic src uses field "target" of type "string".',
    )
  })
})
