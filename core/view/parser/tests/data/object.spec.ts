import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../../splitter"
import { makeHierarchy } from "../../hierarchy"
import { enrichWithData } from "../../data"
import { extractAttributes } from "../../attributes"

describe("object атрибуты (стили) с переменными из разных уровней map", () => {
  it("стили с переменными из разных уровней вложенности", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        companies: {
          id: string
          theme: string
          departments: {
            id: string
            color: string
          }[]
        }[]
      }
    >(
      ({ html, core }) => html`
        <div>
          ${core.companies.map(
            (company) => html`
              <section style="${{ backgroundColor: company.theme }}">
                ${company.departments.map(
                  (dept) => html`
                    <article style="${{ color: company.theme, borderColor: dept.color }}">
                      Dept: ${company.id}-${dept.id}
                    </article>
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
                        object: {
                          style: {
                            color: "../[item]/theme",
                            borderColor: "[item]/color",
                          },
                        },
                      },
                    ],
                  },
                ],
                object: {
                  style: {
                    backgroundColor: "[item]/theme",
                  },
                },
              },
            ],
          },
        ],
      },
    ])
  })

  it("meta-hash элементы с core и context объектами", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        user: {
          id: string
          name: string
          role: string
        }
        theme: string
        settings: {
          language: string
          timezone: string
        }
      }
    >(
      ({ html, core }) => html`
        <meta-hash context=${{ user: core.user, theme: core.theme }} />
        <meta-hash core=${{ settings: core.settings, user: core.user }} />
        <meta-hash context=${{ user: core.user }} core=${{ theme: core.theme }} />
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)

    expect(data).toEqual([
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
            theme: "/core/theme",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          core: {
            settings: "/core/settings",
            user: "/core/user",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
          },
          core: {
            theme: "/core/theme",
          },
        },
      },
    ])
  })

  it("meta элементы с core и context объектами (обычные meta)", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        user: {
          id: string
          name: string
          role: string
        }
        theme: string
        settings: {
          language: string
          timezone: string
        }
      }
    >(
      ({ html, core }) => html`
        <meta-hash context=${{ user: core.user, theme: core.theme }} />
        <meta-hash core=${{ settings: core.settings, user: core.user }} />
        <meta-hash context=${{ user: core.user }} core=${{ theme: core.theme }} />
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)

    expect(data).toEqual([
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
            theme: "/core/theme",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          core: {
            settings: "/core/settings",
            user: "/core/user",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
          },
          core: {
            theme: "/core/theme",
          },
        },
      },
    ])
  })

  it("meta-hash элементы с core и context объектами с вложенными переменными", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        user: {
          id: string
          name: string
          role: string
        }
        theme: string
        settings: {
          language: string
          timezone: string
        }
      }
    >(
      ({ html, core }) => html`
        <meta-hash context=${{ user: core.user, theme: core.theme }} />
        <meta-hash core=${{ settings: core.settings, user: core.user }} />
        <meta-hash context=${{ user: core.user }} core=${{ theme: core.theme }} />
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)

    expect(data).toEqual([
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
            theme: "/core/theme",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          core: {
            settings: "/core/settings",
            user: "/core/user",
          },
        },
      },
      {
        tag: "meta-hash",
        type: "meta",
        object: {
          context: {
            user: "/core/user",
          },
          core: {
            theme: "/core/theme",
          },
        },
      },
    ])
  })
})
