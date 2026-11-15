#!/usr/bin/env python3
"""Sync hikari design tokens into the hikari-zola vendor layer.

Upstream is the published npm package **@celestia-island/hikari**. Seven sheets
are vendored, byte-for-byte, into "themes/hikari-zola/sass/vendor/hikari/"
with a three-line provenance header prepended (contract section 3):

    src/styles/theme/channels.scss   -> _channels.scss
    src/styles/theme/scale.scss      -> _scale.scss
    src/styles/theme/scrollbar.scss  -> _scrollbar.scss
    src/styles/theme/highlight.scss  -> _highlight.scss
    src/styles/reset.scss            -> _reset.scss
    src/styles/selection.scss        -> _selection.scss
    src/styles/polyfill.scss         -> _polyfill.scss

The polyfill sheet is not optional: upstream _selection.scss does
"@use "./polyfill" as *" for its user-select prefix mixin, so a vendor tree
without it fails the Sass build.

Usage
-----
    python scripts/sync-hikari-tokens.py                # npm registry, latest
    python scripts/sync-hikari-tokens.py --check        # drift gate (no writes)
    python scripts/sync-hikari-tokens.py --dry-run      # show what would change
    python scripts/sync-hikari-tokens.py --from DIR     # offline local checkout
    python scripts/sync-hikari-tokens.py --version 0.55.255

"--from" accepts a hikari checkout root (".../hikari"), its "packages/vue"
directory, or any directory whose "src/styles/theme/channels.scss" exists.

The script is idempotent: a second run writes nothing and prints "up to date".
A PROVENANCE file records the synced package version plus a sha256 per vendored
file; it is deterministic (no timestamps) so diffs stay meaningful.

Exit codes: 0 on success / no drift, 1 on drift (--check) or failure.
Zero third-party dependencies -- Python 3.11+ standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import tarfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

NL = chr(10)

PACKAGE = "@celestia-island/hikari"
REGISTRY = "https://registry.npmjs.org/" + PACKAGE
DEFAULT_DEST = "themes/hikari-zola/sass/vendor/hikari"
PROVENANCE_NAME = "PROVENANCE"

#: (upstream path inside the package, vendored file name)
FILES: tuple[tuple[str, str], ...] = (
    ("src/styles/theme/channels.scss", "_channels.scss"),
    ("src/styles/theme/scale.scss", "_scale.scss"),
    ("src/styles/theme/scrollbar.scss", "_scrollbar.scss"),
    ("src/styles/theme/highlight.scss", "_highlight.scss"),
    ("src/styles/reset.scss", "_reset.scss"),
    ("src/styles/selection.scss", "_selection.scss"),
    # Required dependency of _selection.scss ("@use "./polyfill" as *"):
    # dropping it makes the whole theme SCSS build fail, so it syncs too.
    ("src/styles/polyfill.scss", "_polyfill.scss"),
)

USER_AGENT = "hikari-zola-token-sync/1.0 (+https://langyo.xyz)"
TIMEOUT = 30

REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class SyncSource:
    """Where the six upstream sheets come from and which version they belong to."""

    version: str
    origin: str
    sheets: dict[str, str]  # upstream relative path -> text


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def provenance_header(version: str, upstream: str) -> str:
    """The three contract-mandated provenance lines prepended to every sheet."""

    return (
        f"// Vendored from {PACKAGE}@{version}: {upstream}" + NL
        + "// Synced by scripts/sync-hikari-tokens.py (npm tarball; --from DIR for offline use)" + NL
        + "// Do not edit by hand: re-run the sync script to update this copy." + NL
        + NL
    )


def expected_sheet(version: str, upstream: str, body: str) -> str:
    if not body.endswith(NL):
        body += NL

    return provenance_header(version, upstream) + body


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def _read_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/vnd.npm.install-v1+json", "User-Agent": USER_AGENT},
    )

    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310 - fixed registry URL
        return json.loads(response.read().decode("utf-8"))


def fetch_from_registry(version: str | None) -> SyncSource:
    """Download the published tarball and read the six sheets out of it."""

    try:
        packument = _read_json(REGISTRY)
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
        raise SystemExit(
            f"error: cannot reach the npm registry ({exc})." + NL
            + "       use --from <hikari checkout> to sync from a local copy instead."
        ) from exc

    resolved = version or (packument.get("dist-tags") or {}).get("latest")

    if not resolved:
        raise SystemExit("error: the registry metadata carries no dist-tags.latest -- pass --version")

    metadata = (packument.get("versions") or {}).get(resolved)

    if metadata is None:
        available = ", ".join(sorted((packument.get("versions") or {}).keys())[-6:])
        raise SystemExit(f"error: {PACKAGE}@{resolved} is not published (recent versions: {available})")

    tarball_url = ((metadata.get("dist") or {}).get("tarball")) or ""

    if not tarball_url:
        short = PACKAGE.split("/")[-1]
        tarball_url = f"{REGISTRY}/-/{short}-{resolved}.tgz"

    request = urllib.request.Request(tarball_url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310 - registry-provided URL
            tarball = response.read()
    except (urllib.error.URLError, OSError) as exc:
        raise SystemExit(
            f"error: cannot download {tarball_url} ({exc}). use --from <hikari checkout> instead."
        ) from exc

    sheets: dict[str, str] = {}

    with tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz") as archive:
        members = {member.name: member for member in archive.getmembers()}

        for upstream, _name in FILES:
            match = next(
                (name for name in members if name == "package/" + upstream or name.endswith("/" + upstream)),
                None,
            )

            if match is None:
                raise SystemExit(f"error: {PACKAGE}@{resolved} does not ship {upstream} (tarball layout changed)")

            extracted = archive.extractfile(members[match])

            if extracted is None:
                raise SystemExit(f"error: cannot read {match} from the {PACKAGE}@{resolved} tarball")

            sheets[upstream] = extracted.read().decode("utf-8")

    return SyncSource(version=resolved, origin=f"npm registry {PACKAGE}@{resolved}", sheets=sheets)


def _local_bases(root: Path) -> list[Path]:
    return [root, root / "packages" / "vue", root / "vue", root / "packages" / "hikari"]


def _local_version(base: Path) -> str:
    for candidate in (base / "package.json", base.parent / "package.json"):
        if candidate.is_file():
            try:
                version = json.loads(candidate.read_text(encoding="utf-8")).get("version")

                if version:
                    return str(version)
            except (OSError, json.JSONDecodeError):
                continue

    return "local"


def fetch_from_local(root: Path) -> SyncSource:
    """Read the six sheets from a local hikari checkout (offline fallback)."""

    for base in _local_bases(root):
        if not (base / FILES[0][0]).is_file():
            continue

        sheets: dict[str, str] = {}

        for upstream, _name in FILES:
            path = base / upstream

            if not path.is_file():
                raise SystemExit(f"error: {base} does not contain {upstream}")

            sheets[upstream] = path.read_text(encoding="utf-8")

        return SyncSource(version=_local_version(base), origin=f"local checkout {base}", sheets=sheets)

    tried = ", ".join(str(candidate) for candidate in _local_bases(root))
    raise SystemExit(f"error: no hikari styles found under {root} (tried: {tried})")


# ---------------------------------------------------------------------------
# Rendering / writing
# ---------------------------------------------------------------------------

def provenance_text(source: SyncSource, rendered: dict[str, str]) -> str:
    lines = [
        f"package = {PACKAGE}",
        f"version = {source.version}",
        f"source = {source.origin}",
        "synced_by = scripts/sync-hikari-tokens.py",
        "",
    ]

    for upstream, name in FILES:
        lines.append(f"file {name} from={upstream} sha256={_sha256(rendered[name])}")

    return NL.join(lines) + NL


def plan(source: SyncSource, dest: Path) -> tuple[dict[Path, str], list[Path]]:
    """Return (changes {path: new content}, unchanged paths)."""

    rendered: dict[str, str] = {}

    for upstream, name in FILES:
        rendered[name] = expected_sheet(source.version, upstream, source.sheets[upstream])

    changes: dict[Path, str] = {}
    unchanged: list[Path] = []

    for _upstream, name in FILES:
        target = dest / name
        body = rendered[name]
        current = target.read_text(encoding="utf-8") if target.is_file() else None

        if current == body:
            unchanged.append(target)
        else:
            changes[target] = body

    provenance = dest / PROVENANCE_NAME
    body = provenance_text(source, rendered)
    current = provenance.read_text(encoding="utf-8") if provenance.is_file() else None

    if current == body:
        unchanged.append(provenance)
    else:
        changes[provenance] = body

    return changes, unchanged


def apply(changes: dict[Path, str], dry_run: bool) -> None:
    for path in sorted(changes):
        print(f"  {'would write' if dry_run else 'wrote':11s} {path}")

        if not dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(changes[path], encoding="utf-8", newline=NL)


def check(changes: dict[Path, str], dest: Path) -> int:
    if not changes:
        print(f"ok: {dest} matches the upstream token source")
        return 0

    print(f"drift: {dest} does not match the upstream token source")

    for path in sorted(changes):
        state = "missing" if not path.is_file() else "differs"

        print(f"  {state:9s} {path}")

    print("  run: python scripts/sync-hikari-tokens.py")
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Sync hikari design tokens into themes/hikari-zola/sass/vendor/hikari/"
    )
    parser.add_argument(
        "--from",
        dest="local_root",
        metavar="DIR",
        help="offline local hikari checkout (e.g. .../hikari or .../hikari/packages/vue)",
    )
    parser.add_argument("--version", help="npm package version to sync (default: registry dist-tags.latest)")
    parser.add_argument("--dest", help=f"output directory (default: <repo>/{DEFAULT_DEST})")
    parser.add_argument("--check", action="store_true", help="report drift without writing (exit 1 when drifted)")
    parser.add_argument("--dry-run", action="store_true", help="print the files that would change without writing")
    args = parser.parse_args(argv)

    if args.local_root and args.version:
        parser.error("--version pins an npm release; do not combine it with --from")

    dest = Path(args.dest) if args.dest else REPO_ROOT / DEFAULT_DEST
    dest = dest.resolve()

    if args.local_root:
        source = fetch_from_local(Path(args.local_root).expanduser().resolve())
    else:
        source = fetch_from_registry(args.version)

    print(f"hikari tokens: {source.version} <- {source.origin}")
    changes, unchanged = plan(source, dest)

    for path in sorted(unchanged):
        print(f"  up to date  {path}")

    if args.check:
        return check(changes, dest)

    if not changes:
        print(f"nothing to do: {dest} is up to date")
        return 0

    apply(changes, dry_run=args.dry_run)

    if args.dry_run:
        print(f"dry run: {len(changes)} file(s) would change under {dest}")
        return 0

    print(f"synced {len(changes)} file(s) into {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
