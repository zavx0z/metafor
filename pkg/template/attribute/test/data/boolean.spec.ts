import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("boolean атрибуты", () => {
  describe("булевы атрибуты с переменными из разных уровней вложенности", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        any,
        {
          companies: {
            id: string
            active: boolean
            departments: {
              id: string
              active: boolean
            }[]
          }[]
        }
      >(
        ({ html, mass }) => html`
          <div>
            ${mass.companies.map(
              (company) => html`
                <section ${company.active && "data-active"}>
                  ${company.departments.map(
                    (dept) => html`
                      <article ${company.active && dept.active && "data-active"}>
                        Dept: ${company.id}-${dept.id}
                      </article>
                    `,
                  )}
                </section>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/companies",
              child: [
                {
                  tag: "section",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "[item]/departments",
                      child: [
                        {
                          tag: "article",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: ["../[item]/id", "[item]/id"],
                              expr: "Dept: ${_[0]}-${_[1]}",
                            },
                          ],
                          boolean: {
                            "data-active": {
                              data: ["../[item]/active", "[item]/active"],
                              expr: "_[0] && _[1]",
                            },
                          },
                        },
                      ],
                    },
                  ],
                  boolean: {
                    "data-active": {
                      data: "[item]/active",
                    },
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })
  describe("boolean атрибуты с переменными из разных уровней map", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { visible: boolean }>(
        ({ html, value }) => html`<img src="https://example.com" ${value.visible ? "visible" : "hidden"} />`,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "img",
          type: "el",
          string: {
            src: "https://example.com",
          },
          boolean: {
            visible: {
              data: "/value/visible",
            },
            hidden: {
              data: "/value/visible",
              expr: "!_[0]",
            },
          },
        },
      ])
    })
  })
})
