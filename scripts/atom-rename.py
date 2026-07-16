from __future__ import annotations

import re
import subprocess
from pathlib import Path

SELF = "scripts/atom-rename.py"
WORKFLOWS = {
    ".github/workflows/atom-rename.yml",
    ".github/workflows/atom-rename-issue.yml",
}
SKIP = WORKFLOWS | {SELF}
DELETE_BEFORE_RENAME = {
    "types/boundary/actor.ts",
    "bulk/atom.ts",
    "bulk/atom.spec.ts",
}


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def tracked_files() -> list[str]:
    raw = subprocess.check_output(["git", "ls-files", "-z"])
    return [item.decode() for item in raw.split(b"\0") if item]


def rename_tokens(value: str) -> str:
    value = value.replace("ACTORS", "ATOMS")
    value = value.replace("ACTOR", "ATOM")
    value = value.replace("Actors", "Atoms")
    value = value.replace("Actor", "Atom")
    value = re.sub(r"(?<![A-Za-z])actors(?=$|[^a-z])", "atoms", value)
    value = re.sub(r"(?<![A-Za-z])actor(?=$|[^a-z])", "atom", value)
    return value


for path in sorted(DELETE_BEFORE_RENAME):
    if Path(path).exists():
        run("git", "rm", "--", path)

original = [path for path in tracked_files() if path not in SKIP]
moves: list[tuple[str, str]] = []
for source in original:
    target = rename_tokens(source)
    if target != source:
        moves.append((source, target))

for source, target in sorted(moves, key=lambda item: (-item[0].count("/"), -len(item[0]))):
    if not Path(source).exists():
        continue
    if Path(target).exists():
        raise RuntimeError(f"rename collision: {source} -> {target}")
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    run("git", "mv", "--", source, target)

alias_pattern = re.compile(
    r"/\*\* @deprecated[^\n]*\*/\n"
    r"export type [A-Za-z0-9_]*Actor[A-Za-z0-9_]*\s*=\s*"
    r"[A-Za-z0-9_]*Atom[A-Za-z0-9_]*\n?"
)

for path_string in tracked_files():
    if path_string in SKIP:
        continue
    path = Path(path_string)
    if not path.is_file():
        continue
    data = path.read_bytes()
    if b"\0" in data:
        continue
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        continue

    text = alias_pattern.sub("", text)

    if path_string == "types/package.json":
        text = re.sub(
            r'^\s*"\./boundary/actor":\s*"\./boundary/actor\.ts",?\n',
            "",
            text,
            flags=re.MULTILINE,
        )

    text = rename_tokens(text)

    if path_string == "types/bulk/manifest.ts":
        text = re.sub(
            r'export type BulkDarkParticleKind = "wimp" \| "fuzzy" \| "macho" \| "axion"\n\n'
            r'export type BulkManifestedDarkParticleKind = "atom" \| BulkDarkParticleKind\n',
            'export type BulkDarkParticleKind = "atom" | "fuzzy" | "macho" | "axion"\n',
            text,
        )
        text = text.replace("BulkManifestedDarkParticleKind", "BulkDarkParticleKind")
        text = text.replace(
            "/** Legacy declaration/materialization input. Bulk normalizes WIMP instances to Atom before rendering. */\n",
            "",
        )

    if path_string == "bulk/client.ts":
        text = text.replace('import {manifestAtoms} from "./atom.ts"\n', "")
        text = re.sub(
            r"bulkViewport\.applyManifestPatch\(manifestAtoms\((buildBoundaryBulkManifest\([^\n]+\))\)\)",
            r"bulkViewport.applyManifestPatch(\1)",
            text,
        )

    if path_string == "bulk/world.ts":
        text = text.replace("wimpDarkParticleColor", "atomDarkParticleColor")
        text = text.replace("wimpDarkParticleIdFromAtomId", "atomDarkParticleIdFromAtomId")
        text = text.replace("wimpDarkParticleInputFromAtom", "atomDarkParticleInputFromAtom")
        text = text.replace("  wimp: atomDarkParticleColor,", "  atom: atomDarkParticleColor,")

    if path_string.startswith("bulk/") or path_string.startswith("types/bulk/"):
        text = re.sub(r'(darkParticleKind\s*:\s*)"wimp"', r'\1"atom"', text)
        text = text.replace('darkParticleKind).toBe("wimp")', 'darkParticleKind).toBe("atom")')
        text = text.replace('darkParticleKind).toEqual("wimp")', 'darkParticleKind).toEqual("atom")')

    path.write_text(text, encoding="utf-8")

for path in sorted(WORKFLOWS | {SELF}):
    if Path(path).exists():
        run("git", "rm", "--", path)
