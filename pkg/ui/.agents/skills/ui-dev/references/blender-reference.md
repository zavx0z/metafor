# Blender 4.5 reference routing

Read this reference when component semantics or visual parity are in scope. It
is a maintained routing and comparison guide, not a copy of Blender source or
Manual.

## Versioned sources

- Installed visual reference: Blender `4.5.5 LTS`, build `836beaaf597a`.
- Official source mirror:
  `/Users/zavx0z/repozitarium/blender-reference-source`, branch
  `blender-v4.5-release`, revision
  `84afd5f785f7569b97cf3257000403e7847120a8` (`4.5.12 LTS`).
- Bounded offline Manual snapshot:
  `/Users/zavx0z/repozitarium/blender-reference-manual`, revision
  `48f79b7e9246f670283b043da8c6f4240e547241`. This checkout is an unofficial
  Markdown mirror; verify every normative conclusion against the official
  rendered Blender 4.5 Manual, API, or source.
- Maintained owner screenshot:
  `pkg/ui/.agents/skills/ui-dev/assets/blender-4.5.5-reference.png`,
  SHA-256 `a493e1c03591800bb05644963369fca49669aa27f98e67a9971fd91735f2531d`.
- Current NODES-017 owner screenshot and research, while that task exists:
  `project/artifacts/NODES-017/blender-4.5.5-reference.png` and
  `project/artifacts/NODES-017/blender-research.md`.

If a recorded checkout revision or screenshot is absent, stop calling it the
maintained reference. Record a new exact Blender version and owner-visible
reference instead of silently substituting a search image or memory.

## Where to look

Use bounded searches; do not import or copy source into MetaFor.

| Question | Authoritative route |
| --- | --- |
| Node row rhythm and socket radius | `source/blender/editors/space_node/node_intern.hh`: `NODE_DY`, `NODE_DYS`, `NODE_SOCKSIZE` |
| Socket kinds, input/output and eight display shapes | `source/blender/makesdna/DNA_node_types.h`: `eNodeSocketDatatype`, `eNodeSocketDisplayShape`, `eNodeSocketInOut` |
| Default control visibility and socket drawing | `source/blender/editors/space_node/drawnode.cc`: `SOCK_HIDE_VALUE`, `is_logically_linked`, `display_shape` |
| Node body ordering and socket placement | `source/blender/editors/space_node/node_draw.cc` |
| Frame attach/detach and recursive parent protection | `source/blender/editors/space_node/node_relationships.cc`: `NODE_OT_parent_set`, `can_attach_node_to_frame`, `NODE_OT_parent_clear` |
| User-facing Node/Socket/Property anatomy | Official Manual `interface/controls/nodes/parts.html` |
| Frame, Shrink, label/text, parenting | Official Manual `interface/controls/nodes/frame.html` |
| Public Socket properties | Official Python API `bpy.types.NodeSocket` and `bpy.types.NodeSocketStandard` |

Official rendered entrypoints:

- <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/parts.html>
- <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/frame.html>
- <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/editing.html>
- <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/groups.html>
- <https://docs.blender.org/api/4.5/bpy.types.NodeSocket.html>
- <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>

## Model and project divergences

Blender supplies the semantic and visual constraint; MetaFor does not stretch
its terms to fit an unrelated model.

- `Frame` is a visual parent for Node or nested Frame, moves descendants, may
  shrink to them, and is not a reusable Node Group.
- `Node` owns title/header, outputs, properties, inputs, optional preview and
  collapsible sections. Compact row rhythm is shared rather than tuned per
  fixture.
- MetaFor adds first-class `Parameter`: one stable row and one universal Field.
- A Parameter may expose different exact Socket endpoints on both `left` and
  `right`. This is an explicit project extension; Blender normally associates
  input/output with UI side.
- Socket `direction` (`input | output | bidirectional`) is independent from
  MetaFor visual side. Layout policy resolves the side without changing
  endpoint or Parameter identity.
- Links reach exact Socket centers. MetaFor intentionally keeps rounded
  orthogonal routes instead of Blender Bezier links.
- MetaFor intentionally keeps the project `JetBrainsMono-Bold.ttf` from
  `pkg/engine/static` instead of copying Blender typography or font assets.

## Maintained visual defect matrix

Compare one representative scene at a recorded viewport and comparable `100%`
scale. Update each row with `match`, `project divergence`, or a concrete defect;
do not replace this matrix with a general “looks like Blender” verdict.

| Area | Blender/reference invariant | MetaFor check |
| --- | --- | --- |
| Canvas | Scale-aware grid, readable depth and contrast | Grid density, background, scene hierarchy |
| Frame | Separate translucent parent, nested containment, label and border | Not rendered as Node; descendants and paint order remain legible |
| Node | Compact header/body, one theme, collapse and selection | No independent fixture-specific spacing |
| Parameter | One compact row with label/control and legal default state | Field appears once even with left+right endpoints |
| Socket | Exact row center, type color, shape and connected/disabled states | No detached endpoint or label/control overlap |
| Link | Exact endpoints, clear ordinary/selected layers | Rounded orthogonal route is recorded project divergence |
| Controls | Shared low-height rhythm and aligned labels | Connected default is suppressed; styles stay consistent |
| Mobile | Project requirement, not a Blender parity claim | Same Node/renderer identity, responsive Flex, pan/pinch and no horizontal overflow |

A comparison record includes Blender build/source revision, MetaFor commit,
reference/current image paths, target ID and URL, viewport/DPR, per-row result,
and remaining owner decision. Automated captures may populate evidence but
cannot mark owner acceptance.

This reference applies only when `@nodes/ui` Blender parity is in scope. Ordinary
Elements, Components, and shared playground work should not load it.
