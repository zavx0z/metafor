# @ui/playground

`@ui/playground` — общая dev-библиотека и единый каталог playground семейства
UI.

Она предоставляет:

* typed route tree: package overview, prefix overviews и exact story leaves;
* desktop-only FlexBox layout исторического пятипанельного shell на весь canvas;
* typed story registry, metadata/search index и lazy story factories;
* retained catalog, section, dock, source/controls, info и backdrop surfaces;
* поиск, controlled сворачивание групп и bounded navigation window;
* постоянный TypeScript с копированием, variants, controls и events;
* no-HMR ESM hub server с отдельными split bundles для package pages;
* общий `Home` из каждой вложенной страницы на главный каталог.

Consumer владеет собственными stories, production preview Surface, состоянием
поиска/групп и demo-данными. Initial entry может хранить только
metadata, а story factory загружает implementation точным production subpath.
Package не содержит Node, Field, Socket, Bulk, Blender data или product
vocabulary.

```ts
import {
  PlaygroundRouteTreeRouter,
  PlaygroundNavigationSurface,
  PlaygroundStoryPanelSurface,
  definePlaygroundStories,
  planPlaygroundShell,
} from "@ui/playground"
```

Единый процесс запускается командой `bun run ui:playground` на
`http://127.0.0.1:4017`. Главная `/` ведёт на `/elements/`, `/components/`,
`/playground/` и `/hud/`. Каждый префикс story route является overview с `/`,
а exact leaf не имеет завершающего `/`; неизвестный suffix возвращает `404`.

Visible catalog, controls и docs пишутся по-русски; API names, pathname routes,
import specifiers и копируемый TypeScript остаются точными. Elements,
Components и diagnostic Workbench сохраняют package-owned stories и отдельные
browser bundles. HUD честно показывает состав package без выдуманного visual
stand.
