# Catalog and DOM package pages

All commands use the single `nodes` lifecycle process on
`http://127.0.0.1:4018`.

## Catalog

Route `/` must publish `nodesPlayground=ready`, `nodesPlaygroundPage=catalog`
and five package cards with links to the manifest-owned default routes.

## Core

Route `/core/live-node-tree` is DOM-only. It must show `snapshot()`,
ID-addressed `document()`, revisions and ordered Parameter events without
Engine, Node UI or layout code.

## Layout Worker

Route `/layout-worker/protocol` is DOM-only. It must show serializable fixed and
adaptive request/response envelopes, request id and generation.

For every route: exact reload, DOM ready and console `0`. Do not request canvas
or WebGPU evidence.
