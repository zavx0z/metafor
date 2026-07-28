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
