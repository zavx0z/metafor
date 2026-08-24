import {UI_PACKAGE_CATALOG} from "./package-catalog.ts"

const cards = document.getElementById("ui-package-cards")
if (!(cards instanceof HTMLElement)) throw new Error("UI package catalog container is missing")

document.documentElement.dataset.uiPlayground = "starting"
document.documentElement.dataset.uiPlaygroundPage = "catalog"

for (const entry of UI_PACKAGE_CATALOG) {
  const article = document.createElement("article")
  article.className = "package-card"
  article.dataset.package = entry.id

  const heading = document.createElement("h2")
  heading.textContent = entry.packageName
  const title = document.createElement("p")
  title.className = "package-title"
  title.textContent = entry.title
  const summary = document.createElement("p")
  summary.textContent = entry.summary
  const playground = document.createElement("p")
  playground.className = "playground-description"
  playground.textContent = entry.playground
  const meta = document.createElement("p")
  meta.className = "package-meta"
  meta.textContent = `${entry.presentation.toUpperCase()} · ${entry.defaultRoute}`
  const link = document.createElement("a")
  link.href = entry.defaultRoute
  link.textContent = "Открыть страницу package"
  link.setAttribute("aria-label", `Открыть страницу ${entry.packageName}`)

  article.append(heading, title, summary, playground, meta, link)
  cards.append(article)
}

document.documentElement.dataset.uiPackageCount = String(UI_PACKAGE_CATALOG.length)
document.documentElement.dataset.uiPackageIds = UI_PACKAGE_CATALOG.map(({id}) => id).join(",")
document.documentElement.dataset.uiPlayground = "ready"
