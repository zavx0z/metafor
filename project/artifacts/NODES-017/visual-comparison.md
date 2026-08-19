# NODES-017 — Blender / MetaFor visual comparison

## Provenance

* Blender: local `4.5.5 LTS`, build `836beaaf597a`;
  `blender-4.5.5-reference.png`, SHA-256
  `a493e1c03591800bb05644963369fca49669aa27f98e67a9971fd91735f2531d`.
* MetaFor: `codex/node-layot`, current comparison base `e29d374fd`;
  exact target `1E982897F323D83C771E45E6CA2C4C7C`,
  `http://127.0.0.1:4016/`.
* Desktop canvas: `1920×1088 @2`, SHA-256
  `4c380f703b0f290680bfaf2a47a35834da76f1e246146c4e0412ff6ee972726e`.
* Portrait canvas: `390×844 @2`, SHA-256
  `a718e01f2e22d390cb8b408628f6e574b79854995a4eb70370b7d05814f795c0`.
* Landscape canvas: `844×390 @2`, SHA-256
  `4fa99340d6a13a441222421a426e3b9dd084542486d364a9740e4e2d79c2bff9`.
* Live desktop comparison canvas: SHA-256
  `c4055509a2ed4d3db51cf31700b9d2c9f5579f181cb0f5d9ac1211cdf519b2a6`;
  DOM marker `comparison=blender-reference-live-editor`.
* All three targets: readiness `ready`, `scrollWidth=innerWidth`, console errors
  `0`; viewport helper restored native `1920×1088 @2`.

## Matrix

| Area | Blender constraint | MetaFor result | Status |
| --- | --- | --- | --- |
| Canvas | Scale-aware dark grid and readable depth | Dot grid, bounded scene, Frame/Node depth readable | match |
| Frame | Separate translucent parent, nested containment and label | Outer green Frame and nested blue Frame; neither is a Node | match |
| Node | Compact header/body, category identity, collapse and shadow | Shared compact rhythm, category headers, shadow, collapsed Compact Mix | match |
| Font | Blender UI typography | Project JetBrains Mono retained by owner decision | project divergence |
| Parameter | Default control only when unlinked | Connected controls hidden; unlinked Field rendered once | match |
| Two-sided Parameter | Not a Blender capability | Matrix Parameter has distinct left/right endpoints with one Field identity | project extension |
| Socket | Exact row center, type color, shape and state | 19 kinds, 8 shapes, exact centers and connected state | match |
| Link | Exact endpoints and selected layer | Exact centers, selected-last layer, rounded orthogonal routes | project divergence accepted by owner |
| Controls | Shared compact height and aligned labels | Universal scale-aware compact Field and inline Slider | match |
| Mobile | No Blender requirement | Same tree/renderers; responsive overview LOD, pan/pinch, no overflow | project requirement matched in emulation |
| Live comparison | Reference must remain visible while inspecting current UI | Dev-only cropped Blender reference and live editor share one desktop Flex row | match |

## Explicitly open

* Physical Android proof: `@meta/android` reports `devices: []`; emulation and
  synthetic touch do not replace it.
* Owner visual acceptance: only the owner can close this gate after inspecting
  the live target/reference.

No unresolved overlap, detached endpoint, duplicate Parameter Field or broken
Frame hierarchy was observed in the three final captures. This statement is a
recorded agent review, not owner acceptance.
