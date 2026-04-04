# @metafor/template

## Шаблонизатор для **MetaFor**. Извлекает структуру, пути к данным и выражения из tagged template literals **без их выполнения**

`@metafor/template` статически парсит исходный код render-функции, достаёт блок `html\`...\`\` и строит нормализованное дерево элементов, текстов, атрибутов, условий, итераций и **meta‑элементов акторов** (в рамках MetaFor).

- Работает в **NodeType**, **Bun**, браузерах и воркерах
- Поддерживает **условия**, **циклы**, **логические выражения**, **meta‑теги акторов**
- Формирует **пути к данным** и **унифицированные выражения**
- Ничего не исполняет, только анализирует

🛠 Пример

```typescript
const { context: fields, update, onUpdate } = new Context((t) => ({
  cups: t.number.required(0)({ title: "orders" }),
  last: t.string.optional()({ title: "last ordered drink" }),
}))

const mass = {
  menu: [
    { label: "Espresso", size: "30ml" },
    { label: "Cappuccino", size: "200ml" },
    { label: "Latte", size: "250ml" },
  ],
}

let state = "open"

const nodes = parse<typeof fields, typeof mass, "open" | "closed">(
  ({ html, fields, update, mass, state }) => html`
    <h1>☕ Quick Coffee Order</h1>

    <p>
      Status: ${state === "open" ? "🟢 Open" : "🔴 Closed"} · Orders: ${fields.cups}${fields.last &&
      ` · last: ${fields.last}`}
    </p>

    ${state === "open" &&
    html`
      <ul>
        ${mass.menu.map(
          (product) =>
            html`<li>
              ${product.label} (${product.size})
              <button onclick=${() => update({ cups: fields.cups + 1, last: product.label })}>Add</button>
            </li>`
        )}
      </ul>
    `} ${state === "closed" && html`<p>Come back later — we’ll brew something tasty ☺️</p>`}
  `
)
