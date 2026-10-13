import {expect, test} from "bun:test"
import {parseSync, Visitor} from "oxc-parser"

test("office avatar load failure reports one normalized owner-scoped diagnostic without rejecting the existing Visual runtime", async () => {
  const path = new URL("../internal/visual/main/index.tsx", import.meta.url)
  const source = await Bun.file(path).text()
  const callbacks: string[] = []
  new Visitor({CallExpression(node) {
    if (node.callee.type !== "MemberExpression" || node.callee.computed || node.callee.property.type !== "Identifier" || node.callee.property.name !== "catch") return
    const callback = node.arguments[0]
    if (callback?.type !== "ArrowFunctionExpression") return
    const body = source.slice(callback.start, callback.end)
    if (body.includes('"не удалось загрузить avatar asset офиса"')) callbacks.push(body)
  }}).visit(parseSync(path.pathname, source).program)
  expect(callbacks).toHaveLength(1)
  const calls: unknown[][] = []
  // Execute the actual isolated rejection handler; the browser entrypoint,
  // renderer and asset request are never imported or started by this test.
  const reject = new Function("console", `return (${callbacks[0]})`)({error: (...args: unknown[]) => {calls.push(args)}}) as (error: unknown) => void
  await expect(Promise.reject(new Error("fixture missing avatar")).catch(reject)).resolves.toBeUndefined()
  await expect(Promise.reject("fixture failed response").catch(reject)).resolves.toBeUndefined()
  expect(calls).toEqual([
    ["[@internal/visual:main]", "не удалось загрузить avatar asset офиса", {error: "fixture missing avatar"}],
    ["[@internal/visual:main]", "не удалось загрузить avatar asset офиса", {error: "fixture failed response"}],
  ])
})
