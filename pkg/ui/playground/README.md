# @ui/playground

`@ui/playground` — общая dev-библиотека package-owned WebGPU playground.

Она предоставляет:

* typed path/hash router;
* responsive FlexBox layout исторического пятипанельного shell;
* generic catalog, section, dock, info и backdrop surfaces;
* no-HMR Bun server helper для package-specific entry и assets.

Consumer владеет собственными routes, preview surfaces, данными demo и port.
Package не содержит Node, Field, Socket, Bulk или product vocabulary.

```ts
import {
  PlaygroundRouter,
  PlaygroundNavigationSurface,
  planPlaygroundShell,
} from "@ui/playground"
```

Node и Components playground являются public-shell consumers. Components
сохраняет package-owned route/data/preview и устойчивые retained Field parents;
historical Elements playground автоматически не восстанавливается.
