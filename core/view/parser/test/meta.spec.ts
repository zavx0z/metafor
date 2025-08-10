import { describe, expect, it } from "bun:test"
import { parseTemplate, type Schema } from ".."

describe("объекты в атрибутах", () => {
  it("интерполяция объекта context", () => {
    const result = parseTemplate(
      `<meta-hash context="\${{
            name: 'John', 
            age: context.age, 
            family: core.user.family
        }}"></meta-hash>`
    )
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        context: {
          name: "John",
          age: {
            src: "context",
            key: "age",
          },
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект контекста в meta").toEqual(expected)
  })
  it("интерполяция объекта core", () => {
    const result = parseTemplate(
      `<meta-hash core="\${{name: context.name, age: 30, family: core.user.family}}"></meta-hash>`
    )
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        core: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект core в meta").toEqual(expected)
  })
  it("интерполяция объекта context в meta с самозакрывающимся тегом", () => {
    const result = parseTemplate(`<meta-hash context="\${{name: context.name, age: 30, family: core.user.family}}"/>`)
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        context: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект context в meta с самозакрывающимся тегом").toEqual(expected)
  })
  it("интерполяция объекта core в meta с самозакрывающимся тегом", () => {
    const result = parseTemplate(`<meta-hash core="\${{name: context.name, age: 30, family: core.user.family}}"/>`)
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        core: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект core в meta с самозакрывающимся тегом").toEqual(expected)
  })
  it("интерполяция context и core в meta", () => {
    const result = parseTemplate(
      `<meta-hash 
      context="\${{name: context.name, age: 30, family: core.user.family}}"
      core="\${{name: context.name, age: 30, family: core.user.family}}">
      </meta-hash>`
    )
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        context: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
        core: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект context и core в meta").toEqual(expected)
  })
  it("интерполяция context и core в meta с самозакрывающимся тегом", () => {
    const result = parseTemplate(
      `<meta-hash 
      context="\${{name: context.name, age: 30, family: core.user.family}}"
      core="\${{name: context.name, age: 30, family: core.user.family}}"/>`
    )
    const expected: Schema = [
      {
        tag: "meta-hash",
        type: "meta",
        context: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
        core: {
          name: {
            src: "context",
            key: "name",
          },
          age: 30,
          family: {
            src: "core",
            key: "user.family",
          },
        },
      },
    ]
    expect(result, "объект context и core в meta с самозакрывающимся тегом").toEqual(expected)
  })
})
