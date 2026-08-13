# NODES-009 — package boundary evidence

## Baseline

Implementation started from prepared project commit `9ae82ba1d`, whose parent
was `c6b74258000a38812b49f2fe65c2e8ae2e1d0786`.

Before refactor the measured minified browser bundles were:

| Consumer | Bytes | Gzip | Observation |
| --- | ---: | ---: | --- |
| direct validation | 2,990 | 1,020 | direct core module |
| validation through root `nodes` | 283,140 | 83,400 | root barrel pulled renderer/card dependencies |
| `@nodes/layout` | 74,430 | 23,440 | pure numeric engine |
| `@nodes/ui/card-layout` | 204,770 | 57,330 | card preset |
| old `nodes/layout-engine` | 300,040 | 87,580 | card adapter plus numeric layout |

The old root-barrel measurement is the concrete regression target: importing
validation must not load layout or WebGPU UI.

## Current reproducible fixtures

All builds use Bun `1.3.14`, browser target, ESM, minification, no sourcemap and
in-memory output. The executable fixtures live in `pkg/nodes/fixtures/` and the
automated assertions in `pkg/nodes/package-boundary.test.ts`.

```ts
const result = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "none",
})
```

Measured after the refactor:

| Consumer | Entrypoint | Bytes | Gzip | Forbidden composition proof |
| --- | --- | ---: | ---: | --- |
| core validation | `core-consumer.ts` | 3,045 | 1,044 | no renderer, no layout solver |
| fixed card adapter | `fixed-card-consumer.ts` | 96,443 | 30,476 | layout present, renderer and Inspector absent |
| custom positioned WebGPU | `custom-positioned-consumer.ts` | 258,292 | 75,090 | renderer present, fixed layout and Inspector absent |

The root `nodes` regression changed from `283,140` to the core fixture's
`3,045` bytes for the same validation role. Custom positioned UI proves the
future adaptive consumer boundary without claiming that adaptive socket policy
itself has already been designed or implemented.

The automated regression ceilings are intentionally above the current
measurements but below the former accidental compositions: core `< 8,000`,
fixed card `< 115,000`, custom positioned WebGPU `< 300,000` bytes.

## Structural assertions

The automated boundary test also proves:

* `nodes` depends only on `@nodes/layout` for public Worker protocol/transport;
* core source does not import renderer, UI, HUD or product modules;
* `@nodes/ui` has no HUD dependency and no Hamiltonian transport vocabulary;
* the fixed-card adapter imports pure flex geometry through the explicit
  `@ui/elements/flex` entrypoint and does not pull the WebGPU surface;
* every declared package export resolves to a real file;
* the three consumer bundles do not contain the implementations they did not
  select.

These measurements prove code composition and bundle size, not live visual
acceptance or exact process memory.
