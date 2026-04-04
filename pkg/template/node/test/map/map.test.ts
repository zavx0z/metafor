import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index.ts"

describe("map", () => {
  describe("простой map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ list: { type: "array"; required: true; default: [] } }>(
        ({ html, value }) => html`
          <ul>
            ${value.list.map((name) => html`<li>${name}</li>`)}
          </ul>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/value/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("простой map с несколькими детьми", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<{ list: { type: "array"; required: true; default: [] } }>(
        ({ html, value }) => html`
          <ul>
            ${value.list.map(
              (name) => html`
                <li>${name}</li>
                <br />
              `,
            )}
          </ul>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/value/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]",
                    },
                  ],
                },
                {
                  tag: "br",
                  type: "el",
                },
              ],
            },
          ],
        },
      ])
    })
    describe("map в элементе вложенный в map", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { list: { title: string; nested: string[] }[] }>(
          // prettier-ignore
          ({ html, mass }) => html`
          <ul>
            ${mass.list.map(
              ({ title, nested }) => html`
                <li>
                  <p>${title} </p>
                  ${nested.map((n) => html`<em>${n}</em>`)}
                </li>
              `
            )}
          </ul>
        `,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                type: "map",
                data: "/mass/list",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    child: [
                      {
                        tag: "p",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/title",
                          },
                        ],
                      },
                      {
                        type: "map",
                        data: "[item]/nested",
                        child: [
                          {
                            tag: "em",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                data: "[item]",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
    })
    describe("map с индексом", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<{ list: { type: "array"; required: true; default: [] } }>(
          ({ html, value }) => html`
            <ul>
              ${value.list.map((_, i) => html`<li>${i % 2 ? html`<em>A</em>` : html`<strong>B</strong>`}</li>`)}
            </ul>
          `,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                type: "map",
                data: "/value/list",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    child: [
                      {
                        type: "cond",
                        data: "[index]",
                        expr: "_[0] % 2",
                        child: [
                          {
                            tag: "em",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                value: "A",
                              },
                            ],
                          },
                          {
                            tag: "strong",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                value: "B",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
    })
    describe("map в условии", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<{ flag: { type: "boolean" } }, { list: { title: string; nested: string[] }[] }>(
          ({ html, mass, value }) => html`
            ${value.flag
              ? html`
                  <ul>
                    ${mass.list.map(
                      ({ title, nested }) => html`<li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li>`,
                    )}
                  </ul>
                `
              : html`<div>x</div>`}
          `,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            type: "cond",
            data: "/value/flag",
            child: [
              {
                tag: "ul",
                type: "el",
                child: [
                  {
                    type: "map",
                    data: "/mass/list",
                    child: [
                      {
                        tag: "li",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/title",
                          },
                          {
                            type: "map",
                            data: "[item]/nested",
                            child: [
                              {
                                tag: "em",
                                type: "el",
                                child: [
                                  {
                                    type: "text",
                                    data: "[item]",
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "x",
                  },
                ],
              },
            ],
          },
        ])
      })
    })
  })
  describe("map в text вложенный в map", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { list: { title: string; nested: string[] }[] }>(
        ({ html, mass }) => html`
          <ul>
            ${mass.list.map(({ title, nested }) => html`<li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li>`)}
          </ul>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]/title",
                    },
                    {
                      type: "map",
                      data: "[item]/nested",
                      child: [
                        {
                          tag: "em",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
