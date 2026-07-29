# Visual

`@metafor/visual` follows the same package shape as `pkg/ui/*`: semantic
components live at the package root, shared low-level code lives in
`internal/`, and `index.ts` is the only production barrel.

The playground is a separate Bun browser entry:

```sh
bun run visual:playground
```

It renders `playground/fixture/monad-snapshot.json`, a single static full-tree
`BulkObserverSnapshot` captured through Monad. Entity pages reuse the
production Bulk viewport and manifestation pipeline.

Explicit algorithm-lab pages are isolated experiments, not alternate
production Atom layouts. `State Graph` reads the real `.superposition(...)`
declaration from the canonical peer Meta package, shows the resulting JSON
graph, and gives every declared State one independently rotatable layered 3D
viewer containing all paths and branch alternatives from that start. A graph
with four declared States therefore has four cards even when those cards
contain more than four possible paths. Every State identity has one stable
unique color, and occurs at most once inside one card. X levels are path steps,
while cycle Transitions draw back to an existing node instead of duplicating
it. Every card also owns a top-right ViewCube for orthogonal camera selection.
This viewer owns its geometry, camera, guides and screen-facing labels entirely
inside `pkg/visual`; its experimental coordinates and presentation options are
not consumed by Bulk.

`Sphere` and `Torus` beneath `Form skins` are an isolated Form Skin Lab. Both
pages run the same skin catalog (`quantum`, `wire`, `glow`, `silhouette`,
`solid`, `hybrid`) against one fixed geometry per form. `quantum` is the
default one-pass `ThinFilmMaterial`: camera/normal Fresnel, bounded spectral
interference and alpha blending produce a translucent soap-film shell without
textures, framebuffer reads, post-processing or an idle animation clock. Film
and glow colors are derived from one selected color: the membrane receives a
darker translucent tone, while Fresnel, reflections and highlights receive a
brighter tone of the same color instead of using a fixed palette.
Geometric Torus controls do not live in the skin page; they are explored
separately under `Analysis → Torus`.
Copy count, pixel ratio, color, glow and opacity remain playground-only skin
and load inputs. There is no idle render loop and no automatic form rotation.
`Test current skin` explicitly starts a bounded dynamic measurement, while
`Compare all skins` warms and measures every variant sequentially under the
same fixed geometry and load. Both stop rendering when the requested
measurement finishes. The benchmark reports RAF FPS and frame distribution,
CPU command submission cost, draw/pass/object counts, submitted vertex
references, triangles, line segments, geometry buffer size,
framebuffer/render-target estimates, rebuild time and browser heap when
exposed. GPU execution time is deliberately not reported until Renderer
exposes a timestamp-query contract; CPU submit is not presented as GPU time.

`Edges` beneath `Analysis` isolates the geometry of one connection before it
is reused by State Graph or Bulk. It is a parent section with independent
experimental routes:

- `#/edges/composite` — `Составная экспериментальная`: the existing cubic
  Bézier, clearance profile and numerical safety search;
- `#/edges/source-sink` — `Источник → сток`: an analytic two-dimensional
  source/sink field line derived from the complex potential
  `W(z) = gL log(z-SL) - gR log(z-SR)`.

The parent route `#/edges` is the comparison page for saved input sets. The
button inside either experiment viewport stores the current distance, Torus
scales and defaults, Sphere radius and both dragged Sphere offsets, clearance
and lift. It does not store a screenshot or an algorithm result. Every saved
input set is recomputed by every current Edges algorithm: the parent table
places the resulting live previews and metrics side by side, while the table
below an individual experiment shows the same saved sets through only that
experiment's function. Preview canvases contain only the Torus forms, endpoint
Spheres and Edge; formula links, dimensions, labels and controls are excluded.
Because previews are data-driven rather than PNG files, an algorithm change is
visible for every saved example after the page reloads. Saved example JSON is
served by the playground-local `/api/edge-examples` endpoint.

Each formula has a `?` disclosure that states whether it is a MetaFor experiment
or an external physical model, links the physical sources, and explains what
the formula calculates.

The shared scene contains two Torus forms with one
Sphere at each center. Both Torus forms use the browser-local `Наш default`
fixed in `Analysis → Torus`; Edges exposes no separate Torus geometry control.
Each Sphere is moved directly with the left mouse button in the Torus plane;
its center is clamped so the complete Sphere stays inside the Torus hole.
Their center distance is clamped to the saved outer diameter plus a `2 mm`
gap, so the forms cannot touch. The Edge runs center-to-center through a
collision-free cubic field line with vertical endpoint tangents. The control
height is raised automatically until the sampled curve clears both Torus
surfaces with a continuous required-clearance profile. The required clearance
is zero inside either endpoint Sphere, then follows the circular cross-section
of the thickest scaled Torus tube until it reaches the full configured
clearance. This gives the profile a zero starting slope and keeps a tiny Sphere
tangent to the Torus hole solvable without an anomalously tall control point.
The two control heights are independent. Their common base is `2/3` of the
Sphere-center span, distributed by the square roots of the scaled Torus outer
radii. Since endpoint curvature is proportional to the square of a cubic
control-handle length, this makes local Edge curvature proportional to the
corresponding Torus size: a large form gets a longer, softer shoulder and a
small form gets a shorter, tighter one. A shared collision scale can only
increase both derived handles while preserving their ratio; an optional extra
lift then increases both. Control
vectors, dimension lines, allowable Sphere-offset circles and live labels
expose every input and derived value directly in the scene. A full expanded
Torus is intentionally not rendered because it is not a hard obstacle for an
endpoint Sphere. The experimental Edge is drawn as a seven-strand subpixel
bundle around the exact center curve, giving it readable thickness from every
camera direction without changing the calculated route. Every adjustable
parameter has an in-scene Russian help
disclosure. The complete cubic, clearance-profile and Torus-distance formulas
stay centered above the scene. Every unique formula
variable owns a live connector to its source geometry or control, and
the current scalar/vector values update with the same rebuild. Connectors are
independent cubic curves: every variable glyph and its connector share one
stable color, and the curve begins at that exact glyph rather than a common
orthogonal bus. Links stay translucent at rest; hovering either the glyph or
its curve raises both to full color and highlights the referenced scene form
or complete dimension geometry with the same color. The same hover opens a
short Russian explanation of the variable. Left and right Torus instances
also have independent scale factors in the scene; their body, hole, Sphere
limit, spacing limit and Edge collision calculation change together while
the base proportions still come from the saved Analysis Torus defaults.
The source/sink route uses a constant stream function `Ψ` to generate its
points directly, without a per-point differential-equation integrator. Pole
weights are mapped to the square roots of the scaled Torus outer radii so
unequal forms produce unequal field shoulders without letting the larger form
dominate the whole family. The lowest safe analytic contour is selected. At an
extreme dragged-Sphere configuration where that contour family cannot clear a
Torus, one explicit vertical safety factor `λz` is applied and disclosed in
the formula and readout; it is `1` for the unmodified physical line.

Sphere movement is bounded only by its own radius, so its surface may touch
the inner edge of the Torus hole. Edge clearance applies to the free curve
after its Sphere endpoint and does not shrink the Sphere movement area.
All experimental controls and values stay inside the scene. The scene renders
only after a parameter, view or camera change.

`Torus` beneath `Analysis` is a separate geometry laboratory, distinct from
the Torus page in `Form skins`. Its first card exposes the current official
`THREE.TorusGeometry` parameters and defaults: `radius = 1`, `tube = 0.4`,
`radialSegments = 12`, `tubularSegments = 48`, `arc = 2π`,
`thetaStart = 0`, and `thetaLength = 2π`. Every parameter has an in-scene
Russian help disclosure describing its meaning, units and geometry cost. The
immutable Three.js default is shown separately from the editable MetaFor
default. Clicking a parameter's `Наш default` stores its current slider value
as the new browser-local MetaFor default and restores it on later playground
loads. The scene shows the resulting wire geometry, construction guides and
derived primitive counts. The `MetaFor` card exposes the agreed millimetre
dimensions `inner diameter` and `tube diameter` using one scene unit per
millimetre. They stay bidirectionally synchronized with Three.js `radius` and
`tube`; changing the MetaFor inner diameter preserves the outer diameter, while
changing its tube diameter preserves the inner diameter. Read-only width
(`2 × (radius + tube)`) and height (`2 × tube`) expose the resulting form
dimensions in millimetres. Both editable MetaFor diameters range up to
`100 mm`, while the resulting form width has a hard `100 mm` limit. The
effective diameter limits therefore react to the other dimensions. When a
larger form no longer fits, the camera retreats along its current view direction
without automatically moving closer for smaller forms. The scene renders only
after a parameter, view or camera change. Holding `Shift` while dragging any
continuous Torus parameter reduces its movement to one tenth of the native
slider delta; discrete segment counts retain their integer step.

Every playground viewport provides the same local annotation layer. Main Visual
stories, Form Skin, Edges and Torus Analysis store their route, slug, title,
canvas identity and normalized/screen points; State Graph cards additionally
store Atom, State, Transition, layout and camera identity. Turning the pencil
off uploads one composed viewport PNG plus its surface-specific metadata to the
playground REST server. Runtime records are ignored beneath
`playground/.annotations/`.

- `GET /api/annotations` — saved records;
- `GET /api/annotations/latest` — latest JSON;
- `GET /api/annotations/latest.png` or `GET /api/capture/latest` — latest PNG;
- `GET /api/annotations/:id` and `GET /api/annotations/:id.png` — exact record.
