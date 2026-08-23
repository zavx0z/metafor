# @metafor/template

## Шаблонизатор для **MetaFor**. Извлекает структуру, пути к данным и выражения из tagged template literals **без их выполнения**

`@metafor/template` статически парсит исходный код render-функции, достаёт блок `html\`...\`\` и строит нормализованное дерево элементов, текстов, атрибутов, условий, итераций и **meta‑элементов атомов** (в рамках MetaFor).

- Работает в **NodeType**, **Bun**, браузерах и воркерах
- Поддерживает **условия**, **циклы**, **логические выражения**, **meta‑теги атомов**
- Формирует **пути к данным** и **унифицированные выражения**
- Ничего не исполняет, только анализирует

🛠 Пример

```typescript
const { context: value, update, onUpdate } = new Context((t) => ({
  cups: t.number.required(0)({ title: "orders" }),
  last: t.string.optional()({ title: "last ordered drink" }),
  productIds: t.array.required([101, 102, 103])({ title: "products" }),
}))

let state = "open"

const nodes = parse<typeof value, Record<never, never>, "open" | "closed">(
  ({ html, value, update, state }) => html`
    <h1>☕ Quick Coffee Order</h1>

    <p>
      Status: ${state === "open" ? "🟢 Open" : "🔴 Closed"} · Orders: ${value.cups}${value.last &&
      ` · last: ${value.last}`}
    </p>

    ${state === "open" &&
    html`
      <ul>
        ${value.productIds.map(
          (productId) =>
            html`<li>
              Drink #${productId}
              <button onclick=${() => update({ cups: value.cups + 1 })}>Add</button>
            </li>`
        )}
      </ul>
    `} ${state === "closed" && html`<p>Come back later — we’ll brew something tasty ☺️</p>`}
  `
)
