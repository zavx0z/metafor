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

UI Elements/Components playground мигрируются на package только после
интеграции retained hierarchy NODES-018. Первый consumer — Node playground.
