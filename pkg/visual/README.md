# Visual

`@metafor/visual` exposes named complete-snapshot layouts. The playground
navigation lists these layouts rather than enumerating semantic entities.
`outside-in` and `centered-nested` are independent in-progress strategies over
the same snapshot; a future `inside-out` will be another independent strategy.
Semantic components remain at the package root as reusable primitives, shared
low-level code lives in `internal/`, and `index.ts` is the only production
barrel.

The playground is a separate Bun browser entry:

```sh
bun run visual:playground
```

The playground disables Bun HMR. Its client owns GPU devices, canvases and
document listeners for the lifetime of the page, so source changes require a
normal browser reload instead of an in-place module replacement.

It renders `playground/fixture/monad-snapshot.json`, a single static full-tree
`BulkObserverSnapshot` captured through Monad. The main layout reads the
production Bulk manifestation; isolated entity lenses remain development
tools and are not top-level layouts.

Explicit algorithm-lab pages are isolated experiments, not alternate
production Atom layouts. `State Graph` reads the real `.superposition(...)`
declaration from the canonical peer Meta package, shows the resulting JSON
graph, and gives every declared State one independently rotatable layered 3D
viewer containing all paths and branch alternatives from that start. A graph
with four declared States therefore has four cards even when those cards
contain more than four possible paths. Every State identity has one stable
unique color, and occurs at most once inside one card. X levels are path steps,
while cycle Transitions draw back to an existing node instead of duplicating
it. A State itself is a Torus. Spheres inside its hole are the typed Fields
referenced by conditions of that State's outgoing Transitions; they are not
State markers. State uses the same code-owned Torus form as the rest of the
named layout; browser-local analysis values cannot change it. Transitions reuse the playground
`Edges → Hermite` curve builder and connect State centers: a forward
transition bends into positive Z above the graph plane, while a returning
transition bends into negative Z below it. Every card also owns a top-right
ViewCube for orthogonal camera selection. This viewer owns its geometry,
camera, guides and screen-facing labels entirely inside `pkg/visual`; its
experimental coordinates and presentation options are not consumed by Bulk.

The playground `#/outside-in` page composes every declared State sleeve of the
root and every nested Atom into one static recursive scene. It reads the
production manifestation as structural input but computes its own compact
presentation geometry without changing the Bulk contract or source
`BulkManifest`. Every owning Torus retains its real Field particles and
re-packs them with the shared deterministic hexagonal pseudo-circle layout
promoted from `Analysis → Fields → Псевдокруг`. The inner Torus edge is fitted
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
convergence loop or binary radius fitting. A structural
snapshot change builds one new immutable scene in work proportional to its
emitted occurrences, while the render loop consumes that scene without layout
work. Inside each sleeve, fixed-size State Tori use one linear level sweep:
adjacent node radii define row distances and adjacent level maxima define
forward distances. Their code-owned minimum surface gap is one owning Field
diameter at every self-similar level, both within a sleeve and between
different sleeves. No all-pairs scale fitting remains. Only
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
center. It reads canonical materialized `Value` identity carried by each
manifested Field occurrence. Root Fields not shared with descendants keep the
central pseudo-circle; all occurrences of a Value shared across Atom owners
occupy the next common orbit; Fields private to an inner Atom occupy the next
outer orbit. The law repeats by Matter depth. Every orbit starts one complete
Field diameter of its level after the preceding occupied boundary and expands
only when its Fields need more circumference. Shared Values do not collapse
their distinct Field declaration identities.

This page uses the same code-owned Torus component and Hermite forward/return
convention as the isolated State Graph lab. Atom/Matter Tori, nucleus Fields,
State-Tori and their condition Fields all reuse the shared one-pass `quantum`
ThinFilm skin. State labels are omitted only in the composed Atom view; the
isolated State Graph cards retain them. The shared quantum skin starts with
`highlightSize = 1` for every solid Sphere, including nucleus Fields and
condition Fields. This value is fixed by the shared Sphere material and does
not adapt to containment level, projected form size, camera or viewport.
Torus forms retain their independent `highlightSize = 0` default.

`Torus` is the self-similar visual component; `Atom` is one semantic owner of
that form, not the form implementation itself. The same Torus component also
renders State, Fuzzy, Axion, MACHO and recursively placed Matter Tori. Named
layouts derive Torus geometry from snapshot content and package constants
only. The three former playground sliders for inner diameter, marker radius
and orbit gap were not part of that law and are removed.

`Sphere` and `Torus` beneath `Form skins` are an isolated Form Skin Lab. Both
pages run the same skin catalog (`quantum`, `wire`, `glow`, `silhouette`,
`solid`, `hybrid`) against one fixed geometry per form. The fixed Torus uses
the agreed MetaFor resolution `radialSegments = 32` and
`tubularSegments = 192`; State Graph and Atom State-Tori use the same segment
counts instead of their former lower-resolution local constants. `quantum` is the
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
Monad snapshot. It distributes Field centers with a deterministic Fibonacci
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

The sibling route `#/analysis-fields/circle` visualizes the shared
`Псевдокруг` layout. It fills the area of one flat circle with the same
fixed-size typed Field Spheres instead of placing them only on its
circumference. Centers occupy a triangular lattice with spacing equal to one
Field diameter—the hexagonal close packing of equal circles in a plane. The
deterministic compact subset nearest the origin is recentered, and its outer
circle encloses every complete Field. It shares the count control, Quantum Film
skin and static snapshot samples with the pseudo-sphere page. The same pure
function receives the actual marker radius in named layouts and places both
Torus nucleus Fields and condition Fields inside State-Torus.

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
`radialSegments = 32`, `tubularSegments = 192`, `arc = 6.28`,
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
