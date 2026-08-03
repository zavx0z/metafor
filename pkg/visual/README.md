# Visual

`@metafor/visual` exposes executable named complete-snapshot layouts. Every
catalog entry builds one immutable, identity-rich scene from a `BulkManifest`
and exact owner-bound `StateGraph` inputs, so consumers do not switch on layout
slugs themselves. `centered-nested` and `outside-in` are both ready production
strategies selected through the same Bulk renderer binding.
Production source lives only in `src/`. The package itself stays runtime-neutral:
Bulk owns persistent semantic/scene state and product composition. Dark Monad
assembles Graph only for on-demand reads. Bulk owns the visual
update policy, Canvas, `Renderer`, `Space`, `ViewPoint`, Engine adapter and
viewport lifecycle.

`outside-in` is the ready production expression of the repeated recursive
structure. Like `centered-nested`, it composes the immutable
`VisualComponentForest`: each recursive Torus component owns its form, Field
core, complete State sleeves and nested Torus components. Each sleeve directly
owns its State forms, anchored causal particles, Field projections and sampled
edges. A named layout fills the composer while it builds instead of wrapping
flat arrays afterwards. A cached one-time compiler emits stable form indexes
plus homogeneous Transition/Relation line batches; render frames never
traverse or rebuild the layout.

Use `@metafor/visual/layout` for the pure geometry/catalog boundary,
`@metafor/visual/payload` for declarative render data and
`@metafor/visual/payload/reconcile` for the narrow stateless reconciliation
boundary. Persistent state and exact update decisions live in Bulk. Every
public export targets `src/`; no public subpath exposes a store, renderer or
the playground. Material policies are declarative values. Bulk adapts them to
Engine materials in its own adapter. Playground catalogs, entity lenses and
isolated algorithm-lab viewport constructors remain private development source.
Shared strategy-neutral tree, Torus and State-sleeve composition lives in
`src/internal/`.

Production consumers that need only `centered-nested` import
`@metafor/visual/layout/centered-nested`. This narrow entrypoint excludes the
other ready strategy and the playground from the browser bundle.

The playground is a separate Bun browser entry:

```sh
bun run visual:playground
```

The playground disables Bun HMR. Its client owns GPU devices, canvases and
document listeners for the lifetime of the page, so source changes require a
normal browser reload instead of an in-place module replacement.

The private `#/force-stories/*` page is a horizontal tab catalog keyed only by
the eight current Force `Part` values. A Story owns one incoming Particle and
one focused representation of its affected production graph slice. The Photon
representation owns ordered, extensible layout and camera-view collections; the
current slice presents `centered-nested` and `outside-in`, each through exactly
`top` and `side`, as a simultaneous 2×2 matrix. All four displays derive from
one prepared projection and share one Photon/Restart lifecycle. The two private
Engine viewports within each layout consume the same immutable `VisualScene`,
not independent prepared scenes. One compact horizontal toolbar contains only the shared
State-sleeve indicators, Apply/Restart and help; Story identity remains in the
selected Force tab instead of being repeated above the scene. No descriptive
row or control block is repeated below the review workspace or inside a canvas.
A persistent right-hand sidebar stacks exactly two
non-collapsible JSON inspectors: the incoming Force Particle and the prepared
source snapshot used to build the scene. Photon is the first complete scenario:
the projection replayed from real Cloud history through sequence 411 contains
the full causal-and-visual State-sleeve closure for `zavx0z/lada-model` — its
parent/source context, shared and target Fields, Process 12, States 18–20,
Transitions 25–28, Conditions 33–36 and production relations/proxies. The
focused representation runs that slice through both production strategies and
four Bulk viewports. Applying the recorded sequence 412 Photon
changes State `обращение к модели` to `ошибка` and updates only State, Process,
Transition and relation activity/current materials without geometry movement
inside either layout;
restart rebuilds the exact sequence-411 projection. Other Force tabs expose an
explicit unavailable representation until a concrete visual outcome is
verified; they render no synthetic scene. The page does not expand to the
full-world scene and adds no player/timeline controls.

The private implementation has one explicit fixture boundary.
`ForceStories.ts` owns only the eight-part catalog, metadata and routes;
`PhotonForceStory.ts` and `fixture/PhotonStoryFixture.ts` own the recorded
Photon case, closure and provenance. `ForceStoryLabAdapter.ts` uses the public
`bulk/visual` lifecycle to hydrate and update the projection, compose both
layout scenes and expose the shared activity/session snapshot. It remains
private only because it binds that recorded fixture to a dedicated
`VisualSceneViewport`; it does not import Bulk implementation files.
`ForceStoriesLab.ts` renders that adapter and never wires Bulk projection,
manifestation or Force protocol internals itself.

It renders `playground/fixture/monad-snapshot.json`, a single static full-tree
`BulkObserverSnapshot` captured from the Bulk observer contour. The main layout reads the
production Bulk manifestation as immutable structural input; isolated entity
lenses remain development tools and are not top-level layouts.

Explicit algorithm-lab pages are isolated experiments, not alternate
production Atom layouts. `State Graph` reads the real `.superposition(...)`
declaration from the canonical peer Meta package, shows the resulting JSON
graph, and gives every declared State one independently rotatable layered 3D
viewer containing all paths and branch alternatives from that start. A graph
with four declared States therefore has four cards even when those cards
contain more than four possible paths. Every State identity has one stable
unique color. Paths share geometry only before their first differing
Transition. After that split, every path-context occurrence keeps its own
lateral lane on all remaining X-step levels; it is not re-centered when a
neighbouring path ends. A cycle Transition draws back to the existing
occurrence inside its own branch instead of adding another cycle marker. A
State itself is a Torus. Spheres inside its hole are the typed Fields
referenced by conditions of that State's outgoing Transitions; they are not
State markers. State uses the same code-owned Torus form as the rest of the
named layout; browser-local analysis values cannot change it. Transitions reuse the playground
`Edges → Hermite` curve builder and connect State centers: a forward
transition bends into positive Z above the graph plane, while a returning
transition bends into negative Z below it. Every card also owns a top-right
ViewCube for orthogonal camera selection. This viewer owns its geometry,
camera, guides and screen-facing labels entirely inside `pkg/visual`; its
experimental coordinates and presentation options are not consumed by Bulk.

The sibling `#/state-graph/fields` page is a root-only diagnostic stand for the
current Field/State interaction zone. It derives the exact `zavx0z/lada`
`StateGraph` from the saved `BulkObserverSnapshot`, retains only that root Atom's semantic
manifest records and excludes every nested Matter owner. The reduced input is
then passed through the public
`BulkVisualSceneLifecycle.compose → createBulkViewport` path. The lab does
not copy or modify geometry, materials, State sleeves, Field proxies,
Transitions or Relations; its side panel shows the exact root graph JSON used
by the stand. In that production geometry a Process or Finally is a Torus whose
center lies on the major orbit inside the tube volume of its exact State-Torus,
not in the State's central hole. Its read/write Field proxies are typed Spheres
in the centered pseudo-circle core of the Process-Torus; the State-Torus tube
grows around the complete Process content instead of leaving a causal Sphere
outside.

The adjacent `#/state-graph/activity` page compares two manifestations of the
real root `lada` State graph from the saved `BulkObserverSnapshot`. Both cards isolate
that root Atom from nested Matter and use the public
`BulkVisualSceneLifecycle.prepare/compose → createBulkViewport` path. The
first card retains the materialized current State:
exactly its complete sleeve is active and every sibling sleeve is inactive. The
second card clears only the root Atom's current-State pointer, so every sleeve
is inactive. Geometry and identity remain equal between cards; every inactive
sleeve assigns the package-owned `0.24` branch opacity to its State/causal
forms, Field proxies, Transitions and Relations.

The private `#/state-graph/process` page is an experimental placement lab and
does not change the production law above. It uses the recorded `lada-model`
Process 12 owned by State `обращение к модели`, including its real
`action.readFields`, `success.writeFields` and `error.writeFields`. The Process
keeps that exact State ownership but its complete Torus is placed outside the
State-Torus surface with one fixed gap. A thin owner segment records
State → Process; three colored handler groups connect directly to the real
Field proxies in the Process core. `success` and `error` are deliberately not
drawn as State transitions: they write Fields, whose Conditions can then enable
Transitions. The stand exists to approve or reject this geometry before any
production layout contract changes.

The playground `#/outside-in` page composes every declared State sleeve of the
root and every nested Atom into one static recursive scene. It reads the
production manifestation as structural input but computes its own compact
presentation geometry without changing the Bulk contract or source
`BulkManifest`. Every owning Torus retains its real Field particles and
re-packs them with the shared deterministic concentric growth-ring
pseudo-circle layout promoted from `Analysis → Fields → Кольца роста`. The
inner Torus edge is fitted
directly around that actual flat nucleus. A Matter band is created only when
immediate child Tori exist;
otherwise State begins immediately after the Field core. The outer Torus edge
ends immediately after the actual State sleeves, so neither an empty Matter
band nor a fixed production-sized envelope survives in this overview.

In `outside-in`, every declared State starts one separate fully expanded causal
sleeve containing all reachable paths and branches. Repeated State occurrences
in different sleeves preserve path context and are not collapsed into one
State ring. Actual non-overlapping sleeve extents are packed once around the
first available State orbit with at most three bounded linear polar-envelope
passes and one weighted angular prefix pass. Each sleeve receives a sector
proportional to its actual angular demand at the first available orbit; the
direct sector constraint yields a safe radius and one fixed midpoint check may
tighten it. There is no maximum-sized common slot, pairwise collision search,
convergence loop or binary radius fitting. A structural snapshot change builds
one new immutable scene after one-shot owner/root, Field, State-occurrence,
exact-Transition and graph-wide indexes. Canonical deterministic ordering may
sort, so the honest upper bound is `O(N log N + E)` for snapshot size `N` and
emitted path occurrences `E`; no root or State repeats a full source scan.
The render loop consumes that scene without layout work. All sleeves owned by
one Atom start on one common next outer orbit after
that Atom's immediate Matter-Tori. Production reuses only the prefix and
branch-lane algorithm demonstrated by `#/state-graph`, never that lab's numeric
sizes or coordinates. It builds a self-contained `StateGraphRootLayout`
directly with the owner's State-Torus, condition-Field and surface-gap metrics.
A named layout then assigns the sleeve root an angular slot and moves the
complete sleeve with one rigid rotation and translation. It does not recompute
branch lanes or relative node offsets. A nested owner contributes only its one
uniform world transform. No secondary organic or radial repacking and no
all-pairs scale fitting remains. Only
Fields referenced by conditions of a State's outgoing Transitions appear as
typed Spheres inside that State-Torus. The empty
root Torus has a 100 mm outer diameter
(`radius = 27.78 mm`, `tube = 22.22 mm`) and an 11 mm Field radius. Empty Torus
and Field baselines both halve at every containment level; actual content is
never shrunk and instead grows its owning Torus outward. Camera distance,
viewport size, production particle radii and browser state never rescale an
individual form.

The sibling `#/centered-nested` page keeps the same Torus, Field and State
forms but gives every recursive Matter-Torus in one root tree a common world
center. A Torus inner boundary starts immediately after the actual extent of
its owned Field core. Root-private Fields occupy the central pseudo-circle;
private Fields of a nested owner occupy the outermost available orbit of that
owner's core. Fields with a shared materialized `Value` belong to the core of
their highest common owner. Nested Matter-Tori live inside the resulting
parent shell volume and occupy its inner radial bands. The owner's State
sleeves begin only after the actual outer edge of every child Matter-Torus and
take the last occupied band next to the parent's outer edge. Parent States
therefore never occupy a child shell and remain closer to the edge of their own
Torus. Children may expand only the parent's outer boundary; they do not push
its inner boundary away from the Field core. Shared markers owned by the root
are ranked by the
deepest occurrence owner: deeper groups are closer to the center and stable
affinity grouping is retained within one depth. A private Field of a nested
Atom is never pulled into that common root core. It occupies the outermost
available orbit of its own Torus core, immediately before that Torus's inner
boundary and local content gap. Child branches with the greatest maximum
subtree depth receive the innermost Matter range; stable snapshot order breaks
equal-depth ties. One full Field-diameter surface gap separates an owner's
private core from its first shared orbit. Later orbits have no repeated gap;
adjacent radii differ only by the sum of their maximum marker radii. An orbit
keeps its minimum radius instead of expanding to fit more Fields. When its
circumference is insufficient, the layout adds more concentric orbits for that
group and distributes markers across them in proportion to their geometric
capacities.
All Field occurrences backed by one shared materialized `Value` render as one
marker instead of repeating at every child owner. That marker belongs to the
highest common ancestor of all occurrence owners and uses the Field size of
that ancestor's level. The represented declaration identities remain listed
on the placement even though their geometry is collapsed.

Named layout pages render this complete immutable scene through their private
playground adapter: every package placement becomes one Mesh and
every compiled Transition/Relation batch becomes one `LineSegments` from its
ready sampled points. The server/browser payload is deliberately smaller: its
`visual-prepared-scene@1` envelope carries `cubic-hermite@1` owner-local
endpoints/derivatives (one curve per Transition, two per Relation), and the
browser CPU reconstructs the same 64 segments per curve before the unchanged
`LineSegments` geometry builder, writing directly into its Float32 segment
buffer without an intermediate point-object array. Legacy sampled `points` are rejected at the
wire boundary. `StateGraphViewport` is reserved for the isolated
State Graph lab; it is not a second renderer law for `outside-in` or
`centered-nested`. Bulk consumes the same complete scene, changing only world
coordinates into the exact owner's local frame.

This page uses the same code-owned Torus form, recursive component compiler and
Hermite forward/return
convention as the isolated State Graph lab. Atom/Matter Tori, nucleus Fields,
State-Tori, Process/Finally-Tori and their Field proxies all reuse the shared
one-pass `quantum` ThinFilm skin. The shared quantum skin starts with
`highlightSize = 1` for every solid Sphere, including nucleus Fields,
condition Fields and Process read/write Fields. This value is fixed by the
shared Sphere material and does not adapt to containment level, projected form
size, camera or viewport. Torus forms retain their independent
`highlightSize = 0` default.

`Torus` is the repeated form, while `VisualTorusComponent` is the
self-reproducing production unit: form, local Field core, whole State sleeves
and nested components. `Atom` is one semantic owner of that unit, not its
implementation. State, Fuzzy, Axion, MACHO and recursively placed Matter use
the same form and composition laws. Named layouts derive geometry from
snapshot content and package constants only. The three former playground
sliders for inner diameter, marker radius and orbit gap were not part of that
law and are removed.

The reusable Torus form does not itself activate deferred Bulk Axion; the Bulk
visibility policy excludes Axion before invoking the production strategy.

`Sphere` and `Torus` beneath `Form skins` are an isolated Form Skin Lab. Both
pages run the same skin catalog (`quantum`, `wire`, `glow`, `silhouette`,
`solid`, `hybrid`) against one fixed geometry per form. The fixed large Torus
uses the agreed Dark-shell resolution `radialSegments = 64` and
`tubularSegments = 192`; compact State and Field-proxy Torus use the fixed
`32 × 192` embedded resolution. Both are package-owned role laws rather than
camera-dependent LOD. `quantum` is the
default one-pass `ThinFilmMaterial`: camera/normal Fresnel, bounded spectral
interference and alpha blending produce a translucent soap-film surface without
textures, framebuffer reads, post-processing or an idle animation clock. Film
and glow colors are derived from one selected color: the membrane receives a
darker translucent tone, while Fresnel, reflections and highlights receive a
brighter tone of the same color instead of using a fixed palette.
Geometric Torus controls do not live in the skin page; they are explored
separately under `Analysis → Torus`.
Copy count, pixel ratio, color, glow and opacity remain playground-only skin
and load inputs. Highlight size remains an input only for Torus; Sphere always
uses the shared value `1`, so its control is disabled. Highlight size changes
the analytic specular width without adding a render pass; zero disables
localized highlights entirely. There is no idle render loop and no automatic
form rotation.
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
  `W(z) = gL log(z-SL) - gR log(z-SR)`;
- `#/edges/hermite` — `Hermite · балка`: the minimal cubic Hermite polynomial
  defined by two Sphere centers and two explicit endpoint vectors. It uses the
  same interpolation basis as an Euler–Bernoulli beam element.

The parent route `#/edges` is the comparison page for saved input sets. The
button inside any experiment viewport stores the current distance, Torus
scales and defaults, Sphere radius and both dragged Sphere offsets, clearance
and the inputs specific to the active experiment. It does not store a
screenshot or an algorithm result. Every saved
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
route-specific curve. In the composite experiment, the control height is
raised automatically until the sampled curve clears both Torus
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

The Hermite route deliberately keeps route construction and validation
separate. Its complete curve is
`P(t) = h00 SL + h10 VL + h01 SR + h11 VR`, with
`VL = LL dL` and `VR = -LR dR`. Direction angles and tangent lengths are
explicit in-scene inputs. The default directions are the upward normals of the
two flat Torus planes. The default tangent magnitudes reuse the composite
experiment's two independently weighted field shoulders: the Hermite
derivative is three times the equivalent Bézier handle, so unequal Torus forms
produce the same proven asymmetric silhouette by default. Moving a Sphere or
changing either Torus scale updates those defaults until either tangent-length
control is edited manually; after that both lengths are explicit independent
inputs. Torus distance and the configured clearance are measured after the
curve is built, but an unsafe result is reported rather than corrected. This
keeps the experiment free of a hidden height search and makes the influence of
every boundary vector directly observable. The stored-input contract keeps the
four Hermite values optional so examples created by earlier algorithms and
older saved examples use these documented defaults.

Sphere movement is bounded only by its own radius, so its surface may touch
the inner edge of the Torus hole. Edge clearance applies to the free curve
after its Sphere endpoint and does not shrink the Sphere movement area.
All experimental controls and values stay inside the scene. The scene renders
only after a parameter, view or camera change.

`Fields` beneath `Analysis` keeps the spherical comparison over the static
`BulkObserverSnapshot`. It distributes Field centers with a deterministic Fibonacci
sequence on the surface of one pseudo-sphere. Every Field uses the
shared `quantum` ThinFilm skin and its semantic type color from the
manifestation; a subtle white wire sphere exposes the surface used by the
layout. The `Количество Fields` control ranges from `1` to `128` and starts at
the snapshot's actual `54` Fields. Marker radius remains fixed at `1.35 mm`.
For every count the lab measures the shortest chord between Fibonacci points
on a unit sphere and chooses `distribution radius = 2 × marker radius / shortest
chord`. The nearest Field pair therefore touches without intersecting: this is
the maximum-density sphere for the selected deterministic distribution. Its
radius still grows with the Field count, so the form's growth remains directly
observable. Counts above the snapshot size repeat its typed visual samples only
inside this analysis page. The page renders only after a parameter, camera or
viewport change. This spherical experiment remains available for comparison;
named Visual layouts use the sibling pseudo-circle law. Production Bulk
manifestation coordinates remain unchanged.

The sibling `Fields` tabs compare four planar laws with the same count,
fixed-size typed Field Spheres, camera and guide circle. The
`#/analysis-fields/circle` tab preserves the former production law: one Field
at the origin and every other Field on one circle. The playground-only
`#/analysis-fields/sunflower` tab uses Vogel's Fermat spiral
`r_k = sqrt(k / pi)`, `theta_k = 2 pi k phi`; one conservative constant scales
its published unit-density minimum separation to one Field diameter. The
production `#/analysis-fields/growth-rings` tab uses concentric growth fronts:
ring populations are proportional to their circumference, cumulative rounding
preserves the exact count and one analytic scale preserves the Field diameter.
The
playground-only `#/analysis-fields/hex-spiral` tab walks a triangular lattice
one complete hexagonal ring at a time with exact one-diameter neighbours. Both
spiral alternatives and the production growth-ring law are deterministic
`O(N)` constructions without a solver, pairwise search or count-specific
layouts. All remain available for comparison in the playground.

`Fields v2` is a separate top-level Analysis playground page. It reads the
same static snapshot and graph, isolates only the root `lada` Atom and its own
Fields, and removes nested Matter and all causal forms. The initial scene shows
only the resulting root Torus from directly above. Its Torus envelope is still
the standard empty root baseline with a `100 mm` outer diameter and `11.12 mm`
inner diameter; its form does not depend on the Field count. The lada Fields
are retained in snapshot order. Each Field is rendered as one thin, flat,
concentric orbital band outside the root Torus, so the complete set forms a
Saturn-like ring system without Sphere markers. Every band carries the real
Field label and current value; the text geometry itself bends along that
band's radius instead of remaining a straight screen-space label.

`Torus` beneath `Analysis` is a separate geometry laboratory, distinct from
the Torus page in `Form skins`. Its first card exposes the current official
`THREE.TorusGeometry` parameters and defaults: `radius = 1`, `tube = 0.4`,
`radialSegments = 12`, `tubularSegments = 48`, `arc = 2π`,
`thetaStart = 0`, and `thetaLength = 2π`. Every parameter has an in-scene
Russian help disclosure describing its meaning, units and geometry cost. The
immutable Three.js default is shown separately from the editable MetaFor
default. Clicking a parameter's `Наш default` stores its current slider value
as the new browser-local MetaFor default and restores it on later playground
loads. The code default is `radius = 27.78 mm`, `tube = 22.22 mm`,
`radialSegments = 64`, `tubularSegments = 192`, `arc = 6.28`,
`thetaStart = -0.003` and `thetaLength = 6.28`. The scene shows the resulting
wire geometry, construction guides and derived primitive counts. The
`MetaFor` card exposes the agreed millimetre
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

Every playground viewport provides the same local annotation layer. Main Visual,
Form Skin, Edges and Torus Analysis store their route, slug, title,
canvas identity and normalized/screen points; State Graph cards additionally
store Atom, State, Transition, layout and camera identity. Turning the pencil
off uploads one composed viewport PNG plus its surface-specific metadata to the
playground REST server. Runtime records are ignored beneath
`playground/.annotations/`.

- `GET /api/annotations` — saved records;
- `GET /api/annotations/latest` — latest JSON;
- `GET /api/annotations/latest.png` or `GET /api/capture/latest` — latest PNG;
- `GET /api/annotations/:id` and `GET /api/annotations/:id.png` — exact record.
