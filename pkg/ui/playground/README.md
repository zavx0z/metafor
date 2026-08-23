# @ui/playground

`@ui/playground` — общая dev-библиотека package-owned WebGPU playground.

Она предоставляет:

* typed pathname route declaration и router;
* desktop-only FlexBox layout исторического пятипанельного shell на весь canvas;
* typed story registry, metadata/search index и lazy story factories;
* retained catalog, section, dock, source/controls, info и backdrop surfaces;
* поиск, controlled сворачивание групп и bounded navigation window;
* постоянный TypeScript с копированием, variants, controls и events;
* no-HMR ESM server helper со split chunks для package entry и assets.

Consumer владеет собственными stories, routes, production preview Surface,
состоянием поиска/групп, данными demo и port. Initial entry может хранить только
metadata, а story factory загружает implementation точным production subpath.
Package не содержит Node, Field, Socket, Bulk, Blender data или product
vocabulary.

```ts
import {
  PlaygroundRouter,
  PlaygroundNavigationSurface,
  PlaygroundStoryPanelSurface,
  definePlaygroundStories,
  planPlaygroundShell,
} from "@ui/playground"
```

Visible catalog, controls и docs пишутся по-русски; API names, pathname routes,
import specifiers и копируемый TypeScript остаются точными. Owner-visible
reference работает на `http://127.0.0.1:4192/overview`: две панели слева,
production preview по центру, variants снизу и постоянный code/copy справа.

Root Nodes, Node UI, Components и восстановленный historical Elements
playground являются public-shell consumers. Каждый сохраняет package-owned
routes/data/preview; Components владеет устойчивыми retained Field parents,
Elements — одним retained preview parent. Чистый `@nodes/layout` сохраняет свой
отдельный package-local SVG playground без WebGPU и не входит в общий shell.
