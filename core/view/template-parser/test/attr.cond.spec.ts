import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - условные атрибуты", () => {
  it("условный атрибут с тернарным оператором", () => {
    const result = parseTemplate(`<div class="\${isActive ? 'active' : 'inactive'}">Content</div>`)
    
    const expected: Schema = [
      {
        tag: "div",
        type: "el",
        attrs: {
          class: {
            type: "conditional",
            src: "isActive",
            key: "isActive",
            trueValue: "active",
            falseValue: "inactive",
          },
        },
        child: [
          {
            type: "text",
            value: "Content",
          },
        ],
      },
    ]
    
    expect(result, "условный атрибут с тернарным оператором").toEqual(expected)
  })

  it("условный атрибут с логическим AND", () => {
    const result = parseTemplate(`<button \${isDisabled && "disabled"}>Click me</button>`)
    
    const expected: Schema = [
      {
        tag: "button",
        type: "el",
        attrs: {
          disabled: {
            type: "conditional",
            src: "isDisabled",
            key: "isDisabled",
            trueValue: "disabled",
          },
        },
        child: [
          {
            type: "text",
            value: "Click me",
          },
        ],
      },
    ]
    
    expect(result, "условный атрибут с логическим AND").toEqual(expected)
  })

  it("условный атрибут с логическим OR", () => {
    const result = parseTemplate(`<div class="\${theme || 'default'}">Content</div>`)
    
    const expected: Schema = [
      {
        tag: "div",
        type: "el",
        attrs: {
          class: {
            type: "conditional",
            src: "theme",
            key: "theme",
            trueValue: "theme",
            falseValue: "default",
          },
        },
        child: [
          {
            type: "text",
            value: "Content",
          },
        ],
      },
    ]
    
    expect(result, "условный атрибут с логическим OR").toEqual(expected)
  })
})