import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/template/types/node/index"

describe("object атрибуты (стили) с переменными из разных уровней map", () => {
  describe("стили с переменными из разных уровней вложенности", () => {
    let elements: NodeType[]
    type Core = {
      companies: {
        id: string
        theme: string
        departments: {
          id: string
          color: string
        }[]
      }[]
    }
    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass }) => html`
          <div>
            ${mass.companies.map(
              (company) => html`
                <section style="${{ backgroundColor: company.theme }}">
                  ${company.departments.map(
                    (dept) => html`
                      <article
                        style="${{
                          color: company.theme,
                          borderColor: dept.color,
                        }}">
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
                          style: {
                            color: {
                              data: "../[item]/theme",
                            },
                            borderColor: {
                              data: "[item]/color",
                            },
                          },
                        },
                      ],
                    },
                  ],
                  style: {
                    backgroundColor: {
                      data: "[item]/theme",
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

  describe("стили со смешанными статическими и динамическими значениями", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<
        any,
        {
          users: {
            id: string
            theme: string
          }[]
        }
      >(
        ({ html, mass }) => html`
          <div>
            ${mass.users.map(
              (user) => html`
                <div
                  style="${{
                    color: "red",
                    backgroundColor: user.theme,
                    border: "1px solid black",
                    fontSize: "14px",
                  }}">
                  User: ${user.id}
                </div>
              `
            )}
          </div>
        `
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
              data: "/mass/users",
              child: [
                {
                  tag: "div",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]/id",
                      expr: "User: ${_[0]}",
                    },
                  ],
                  style: {
                    color: "red",
                    backgroundColor: {
                      data: "[item]/theme",
                    },
                    border: "1px solid black",
                    fontSize: "14px",
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
