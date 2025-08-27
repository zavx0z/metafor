import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../../splitter"
import { makeHierarchy } from "../../hierarchy"
import { enrichWithData } from "../../data"
import { extractAttributes } from "../../attributes"

describe("boolean атрибуты с переменными из разных уровней map", () => {
  it("булевые атрибуты с переменными из разных уровней вложенности", () => {
    const mainHtml = extractMainHtmlBlock<
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
      ({ html, core }) => html`
        <div>
          ${core.companies.map(
            (company) => html`
              <section ${company.active && "data-active"}>
                ${company.departments.map(
                  (dept) => html`
                    <article ${company.active && dept.active && "data-active"}>Dept: ${company.id}-${dept.id}</article>
                  `
                )}
              </section>
            `
          )}
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)

    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            type: "map",
            data: "/core/companies",
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
                            expr: "Dept: ${0}-${1}",
                          },
                        ],
                        boolean: {
                          "data-active": {
                            data: ["../[item]/active", "[item]/active"],
                            expr: "${0} && ${1}",
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
