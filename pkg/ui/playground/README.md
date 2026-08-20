# @ui/playground

`@ui/playground` — общая dev-библиотека package-owned WebGPU playground.

Она предоставляет:

* typed pathname route declaration и router;
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

Node, Components и восстановленный historical Elements playground являются
public-shell consumers. Каждый сохраняет package-owned routes/data/preview;
Components владеет устойчивыми retained Field parents, Elements — одним
retained preview parent. Solver-only Node layout playground остаётся отдельным
не-WebGPU contour и в этот shell не входит.
