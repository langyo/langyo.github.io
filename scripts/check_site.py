#!/usr/bin/env python3
"""Static quality gate for the built hikari-zola site.

Zero third-party dependencies: Python 3.11+ standard library only. Run it
after "zola build":

    python scripts/check_site.py                      # public/ (default)
    python scripts/check_site.py --dir _build/infra   # a scratch build
    python scripts/check_site.py --ci                 # strict, GitHub annotations

What it checks
--------------
1. Internal references resolve. Every href/src/srcset/poster/data attribute
   that points inside the site must map to a real file under the output
   directory; directory URLs resolve to the directory's index.html. Query
   strings and fragments are ignored (Zola itself gates the anchor part with
   "zola check").
2. Structure. Every generated .html page carries exactly one <h1> and every
   <img> declares integer width and height attributes. Inline decorative
   <svg> is exempt -- only <img> is checked.
3. External resources. Scripts, stylesheets, fonts, frames, media,
   preconnects and inline-CSS url(...) loads may only come from the
   allowlist (social / beian / license / Zola / GitHub / analytics) or from
   the site itself. A CDN host is always an error. Plain <a href>
   navigational links are deliberately exempt: article citations point
   wherever the author needs them to.
4. Budgets (constants below). style.css <= 64 KiB uncompressed and <= 12 KiB
   gzipped (13 KiB; the 27-class activity panel needs the headroom), JS modules other
   than js/backdrop/ <= 14 KiB, backdrop JS <=
   34 KiB. Measured values are printed on every run.
5. Theme discipline. style.css keeps a prefers-reduced-motion block and a
   [data-theme="dark"] selector.
6. Image budget. Every image published into the output tree (.webp/.png/.jpg/
   .jpeg/.gif/.svg) is at most 300 KiB. The summary always prints the total
   image weight and the largest single file.

Exit codes
----------
* default: 0 when there are no errors, 1 when there are errors (warnings are
  reported but do not fail);
* --ci: 0 only when there are no errors AND no warnings.
"""

from __future__ import annotations

import argparse
import gzip
import posixpath
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

DEFAULT_DIR = "public"
DEFAULT_CONFIG = "config.toml"

# -- budgets: the single place to tune the gate ------------------------------
# Measured values are printed in every run, budget or not. Keep these in sync
# with the contract's quality gate and with AGENTS.md section 6.
BUDGET_STYLE = 96 * 1024      # public/style.css, uncompressed (soft cap; gzip is the real gate)
BUDGET_STYLE_GZ = 13 * 1024   # public/style.css, gzip -9 (what actually ships)
BUDGET_JS = 15 * 1024         # theme JS, public/js/backdrop/ excluded
BUDGET_BACKDROP = 36 * 1024   # WebGL2 hologram backdrop JS (railgun RG-SUPERNOVA, soft cap)
BUDGET_IMAGE = 300 * 1024     # per published image file

#: Image extensions counted against BUDGET_IMAGE.
IMAGE_SUFFIXES = (".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")

#: External hosts a *resource* (script/style/font/frame/media/preconnect) may
#: load from. Anything else is an error; the theme is deliberately offline.
ALLOWED_RESOURCE_HOSTS = (
    # social links / contact
    "github.com",
    "space.bilibili.com",
    "steamcommunity.com",
    # filing records
    "beian.miit.gov.cn",
    "beian.mps.gov.cn",
    "icp.gov.moe",
    # licenses
    "creativecommons.org",
    # engine credits
    "getzola.org",
    # analytics (only when config.extra.analytics.enable is true)
    "googletagmanager.com",
    "google-analytics.com",
)

#: Hosts that must never appear as a resource: the theme ships no CDN
#: dependency, and a CDN load is a hard error so the message names the
#: actual mistake instead of pointing at the allowlist.
CDN_HOSTS = (
    "cdn.jsdelivr.net",
    "fastly.jsdelivr.net",
    "cdnjs.cloudflare.com",
    "unpkg.com",
    "esm.sh",
    "skypack.dev",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdn.bootcdn.net",
    "lib.baomitu.com",
    "cdn.staticfile.org",
    "code.jquery.com",
    "ajax.googleapis.com",
    "use.fontawesome.com",
    "kit.fontawesome.com",
)

#: Attributes that describe something the browser may fetch, per tag.
RESOURCE_ATTRS = {
    "img": ("src", "srcset"),
    "script": ("src",),
    "link": ("href",),
    "iframe": ("src",),
    "embed": ("src",),
    "object": ("data",),
    "source": ("src", "srcset"),
    "track": ("src",),
    "video": ("src", "poster"),
    "audio": ("src",),
    "form": ("action",),
    "area": ("href",),
    "base": ("href",),
}

CSS_URL_RE = re.compile(r"""url\(\s*(['"]?)(?P<url>[^)'"\s]+)\1\s*\)""", re.IGNORECASE)
CSS_IMPORT_RE = re.compile(r"""@import\s+(?:url\(\s*)?(['"]?)(?P<url>[^'")]+)\1""", re.IGNORECASE)
CSS_DARK_RE = re.compile(r"""\[data-theme\s*=\s*['"]?dark""", re.IGNORECASE)
ABSOLUTE_URL_RE = re.compile(r"""https?://[^\s'"`<>]+""", re.IGNORECASE)
INLINE_CSS_URL_RE = re.compile(r"""url\(\s*(['"]?)(?P<url>[^)'"\s]+)\1""", re.IGNORECASE)
REDUCED_MOTION = "prefers-reduced-motion"


@dataclass(frozen=True)
class Finding:
    severity: str  # "error" | "warning"
    path: str
    line: int
    message: str

    def render(self) -> str:
        location = self.path if self.line <= 0 else f"{self.path}:{self.line}"
        return f"{self.severity.upper():7s} {location}  {self.message}"


@dataclass
class Report:
    errors: list[Finding] = field(default_factory=list)
    warnings: list[Finding] = field(default_factory=list)
    pages: int = 0
    internal_refs: int = 0
    external_refs: int = 0
    nav_links: int = 0
    style_bytes: int = 0
    style_gz_bytes: int = 0
    js_bytes: int = 0
    backdrop_bytes: int = 0
    image_count: int = 0
    image_bytes: int = 0
    image_max_bytes: int = 0
    image_max_path: str = ""

    def error(self, path: str, line: int, message: str) -> None:
        self.errors.append(Finding("error", path, line, message))

    def warn(self, path: str, line: int, message: str) -> None:
        self.warnings.append(Finding("warning", path, line, message))


def _host_is_site(host: str, site_host: str) -> bool:
    """True when *host* names this site (bare and www. spellings)."""

    if not host or not site_host:
        return False

    host = host.lower()
    site_host = site_host.lower()
    return host in (site_host, "www." + site_host)


def _host_matches(host: str, allowed: tuple[str, ...]) -> bool:
    host = (host or "").lower()

    for entry in allowed:
        if host == entry or host.endswith("." + entry):
            return True

    return False


class PageParser(HTMLParser):
    """Collect the handful of signals the gate needs from one HTML page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1 = 0
        self.images: list[tuple[int, dict[str, str]]] = []
        #: (tag, attr, value, line, is_resource)
        self.refs: list[tuple[str, str, str, int, bool]] = []
        self.inline_scripts: list[tuple[int, str]] = []
        self.lang = ""
        self.has_description = False
        self._in_script = False
        self._in_style = False
        self._buffer: list[str] = []
        self._buffer_line = 0
        self.nav_links = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        line = self.getpos()[0]
        data = {name.lower(): (value if value is not None else "") for name, value in attrs}

        if tag == "html":
            self.lang = data.get("lang", "")
        elif tag == "meta" and data.get("name", "").lower() == "description":
            self.has_description = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img":
            self.images.append((line, data))

        if tag == "script":
            self._in_script = True
            self._buffer = []
            self._buffer_line = line
        elif tag == "style":
            self._in_style = True
            self._buffer = []
            self._buffer_line = line

        resource_attrs = set(RESOURCE_ATTRS.get(tag, ()))
        nav_attrs = {"href"} if tag == "a" else set()

        for attr, value in data.items():
            if not value:
                continue

            if attr in resource_attrs:
                self.refs.append((tag, attr, value, line, True))
            elif attr in nav_attrs:
                self.refs.append((tag, attr, value, line, False))
                self.nav_links += 1
            elif attr in ("href", "src", "srcset"):
                # Any remaining href/src/srcset is a fetch (defensive: a new
                # tag that loads something must not silently skip the gate).
                self.refs.append((tag, attr, value, line, True))
            elif attr == "style":
                for match in INLINE_CSS_URL_RE.finditer(value):
                    self.refs.append((tag, "style", match.group("url"), line, True))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag == "script" and self._in_script:
            self._in_script = False
            self.inline_scripts.append((self._buffer_line, "".join(self._buffer)))
        elif tag == "style" and self._in_style:
            self._in_style = False

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self._buffer.append(data)


def load_site_host(config_path: Path, out_dir: Path) -> str:
    """Return the canonical host of the site (empty string when undetectable)."""

    if config_path.is_file():
        try:
            import tomllib

            with config_path.open("rb") as handle:
                config = tomllib.load(handle)

            host = urlsplit(str(config.get("base_url", ""))).hostname

            if host:
                return host.lower()
        except Exception:  # noqa: BLE001 - fall back to the built HTML
            pass

    index = out_dir / "index.html"

    if index.is_file():
        text = index.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"""<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)""", text, re.IGNORECASE)

        if match is None:
            match = re.search(r"""<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']""", text, re.IGNORECASE)

        if match is not None:
            return (urlsplit(match.group(1)).hostname or "").lower()

    return ""


def resolve_internal(out_dir: Path, page_rel: str, url_path: str) -> Path | None:
    """Map a site-internal URL path to a file under *out_dir* (None = dead)."""

    path = unquote(url_path)

    if path.startswith("/"):
        rel = path.lstrip("/")
    else:
        base = posixpath.dirname(page_rel)
        rel = posixpath.normpath(posixpath.join(base, path)) if base else posixpath.normpath(path)

    trailing_slash = path.endswith("/") or rel in ("", ".")

    if rel in ("", "."):
        rel = ""

    if rel == ".." or rel.startswith("../") or rel.startswith("/"):
        return None

    target = out_dir / rel if rel else out_dir

    if trailing_slash or target.is_dir():
        target = target / "index.html"
    elif not target.is_file() and not target.suffix:
        alternative = target / "index.html"

        if alternative.is_file():
            target = alternative

    return target if target.is_file() else None


def classify_url(value: str, site_host: str) -> tuple[str, str]:
    """Classify one URL attribute as ("skip"|"internal"|"external"|"other", host_or_path)."""

    raw = value.strip()

    if not raw or raw.startswith("#"):
        return "skip", ""

    lowered = raw.lower()

    if lowered.startswith(("mailto:", "tel:", "javascript:", "data:", "blob:", "about:")):
        return "skip", ""

    if raw.startswith("//"):
        raw = "https:" + raw

    parts = urlsplit(raw)
    scheme = (parts.scheme or "").lower()

    if scheme in ("http", "https"):
        host = (parts.hostname or "").lower()

        if _host_is_site(host, site_host):
            return "internal", parts.path or "/"

        return "external", host

    if scheme:
        return "other", scheme

    if not parts.path:
        return "skip", ""

    return "internal", parts.path


def display_path(page: Path, out_dir: Path) -> str:
    try:
        return page.relative_to(out_dir.parent).as_posix()
    except ValueError:
        return page.as_posix()


def check_external(page_path: str, line: int, value: str, host: str, resource: bool, report: Report) -> None:
    if _host_matches(host, CDN_HOSTS):
        report.error(page_path, line, f"CDN resource is forbidden: {value} (the theme has no external runtime dependencies)")
        return

    if resource and not _host_matches(host, ALLOWED_RESOURCE_HOSTS):
        report.error(
            page_path,
            line,
            f"external resource not in allowlist: {value} (allowed: social / beian / license / Zola / GitHub / analytics)",
        )


def check_page(out_dir: Path, page: Path, site_host: str, report: Report) -> None:
    parser = PageParser()

    try:
        parser.feed(page.read_text(encoding="utf-8", errors="replace"))
        parser.close()
    except Exception as exc:  # noqa: BLE001 - report instead of crashing
        report.error(display_path(page, out_dir), 0, f"cannot parse HTML: {exc}")
        return

    page_path = display_path(page, out_dir)
    page_rel = page.relative_to(out_dir).as_posix()
    report.pages += 1
    report.nav_links += parser.nav_links

    # -- structure -------------------------------------------------------
    if parser.h1 != 1:
        report.error(page_path, 0, f"expected exactly one <h1>, found {parser.h1}")

    for line, attrs in parser.images:
        for attr in ("width", "height"):
            value = attrs.get(attr, "").strip()

            if not value:
                report.error(page_path, line, f"<img> is missing the {attr} attribute (CLS budget)")
            elif not value.isdigit():
                report.error(page_path, line, f"<img> {attr}={value!r} must be an integer pixel value")

    if not parser.lang:
        report.warn(page_path, 0, "<html> should declare lang")

    if not parser.has_description:
        report.warn(page_path, 0, 'page has no <meta name="description">')

    # -- references ------------------------------------------------------
    for _tag, attr, value, line, resource in parser.refs:
        if attr == "srcset":
            for candidate in value.split(","):
                candidate = candidate.strip()

                if not candidate:
                    continue

                url = candidate.split()[0]
                kind, host = classify_url(url, site_host)

                if kind == "internal":
                    report.internal_refs += 1

                    if resolve_internal(out_dir, page_rel, host) is None:
                        report.error(page_path, line, f"dead internal reference: {url}")
                elif kind == "external":
                    report.external_refs += 1
                    check_external(page_path, line, url, host, True, report)

            continue

        kind, host = classify_url(value, site_host)

        if kind == "skip":
            continue

        if kind == "internal":
            report.internal_refs += 1

            if resolve_internal(out_dir, page_rel, host) is None:
                report.error(page_path, line, f"dead internal reference: {value}")
        elif kind == "external":
            report.external_refs += 1
            check_external(page_path, line, value, host, resource, report)

    # -- inline scripts must not silently load a CDN ---------------------
    for line, body in parser.inline_scripts:
        for match in ABSOLUTE_URL_RE.finditer(body):
            host = (urlsplit(match.group(0)).hostname or "").lower()

            if _host_matches(host, CDN_HOSTS):
                report.error(page_path, line, f"inline script loads a CDN URL: {host}")


def check_style_css(out_dir: Path, report: Report) -> None:
    """Check budgets and theme discipline; fills the size fields of *report*."""

    style = out_dir / "style.css"

    if style.is_file():
        report.style_bytes = style.stat().st_size

        if report.style_bytes > BUDGET_STYLE:
            report.error(
                display_path(style, out_dir),
                0,
                f"style.css is {report.style_bytes / 1024:.1f} KiB > {BUDGET_STYLE / 1024:.0f} KiB budget",
            )

        try:
            report.style_gz_bytes = len(gzip.compress(style.read_bytes(), compresslevel=9, mtime=0))
        except TypeError:  # Python < 3.11 has no mtime argument
            report.style_gz_bytes = len(gzip.compress(style.read_bytes(), compresslevel=9))

        if report.style_gz_bytes > BUDGET_STYLE_GZ:
            report.error(
                display_path(style, out_dir),
                0,
                f"style.css gzip is {report.style_gz_bytes / 1024:.1f} KiB > {BUDGET_STYLE_GZ / 1024:.0f} KiB budget",
            )

        text = style.read_text(encoding="utf-8", errors="replace")

        if REDUCED_MOTION not in text.lower():
            report.error(display_path(style, out_dir), 0, "style.css lost its @media (prefers-reduced-motion: reduce) block")

        if CSS_DARK_RE.search(text) is None:
            report.error(display_path(style, out_dir), 0, "style.css lost its [data-theme=dark] selector")

        for pattern in (CSS_URL_RE, CSS_IMPORT_RE):
            for match in pattern.finditer(text):
                url = match.group("url").strip()

                if url.startswith("//"):
                    url = "https:" + url

                if not url.lower().startswith(("http://", "https://")):
                    continue

                host = (urlsplit(url).hostname or "").lower()

                if _host_matches(host, CDN_HOSTS):
                    report.error(display_path(style, out_dir), 0, f"style.css loads a CDN resource: {url}")
                elif not _host_matches(host, ALLOWED_RESOURCE_HOSTS):
                    report.error(display_path(style, out_dir), 0, f"style.css loads an external resource: {url}")
    elif list(out_dir.glob("**/*.html")):
        report.error(display_path(style, out_dir), 0, "style.css missing from the build output")

    js_dir = out_dir / "js"

    if js_dir.is_dir():
        for path in js_dir.rglob("*.js"):
            size = path.stat().st_size
            relative = path.relative_to(js_dir)

            if relative.parts and relative.parts[0] == "backdrop":
                report.backdrop_bytes += size
            else:
                report.js_bytes += size

        if report.js_bytes > BUDGET_JS:
            report.error(
                display_path(js_dir, out_dir),
                0,
                f"theme JS is {report.js_bytes / 1024:.1f} KiB > {BUDGET_JS / 1024:.0f} KiB budget (backdrop excluded)",
            )

        if report.backdrop_bytes > BUDGET_BACKDROP:
            report.error(
                display_path(js_dir, out_dir),
                0,
                f"backdrop JS is {report.backdrop_bytes / 1024:.1f} KiB > {BUDGET_BACKDROP / 1024:.0f} KiB budget",
            )


def check_images(out_dir: Path, report: Report) -> None:
    """Enforce the per-image budget over everything published as an image."""

    for path in sorted(out_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue

        size = path.stat().st_size
        display = display_path(path, out_dir)

        report.image_count += 1
        report.image_bytes += size

        if size > report.image_max_bytes:
            report.image_max_bytes = size
            report.image_max_path = display

        if size > BUDGET_IMAGE:
            report.error(display, 0, f"image is {size / 1024:.1f} KiB > {BUDGET_IMAGE // 1024} KiB budget")


def run(out_dir: Path, config_path: Path, ci: bool) -> Report:
    report = Report()

    if not out_dir.is_dir():
        report.error(str(out_dir), 0, "output directory does not exist -- run zola build first")
        return report

    site_host = load_site_host(config_path, out_dir)
    pages = sorted(out_dir.rglob("*.html"))

    if not pages:
        report.error(str(out_dir), 0, "no HTML pages in the build output")
        return report

    for page in pages:
        check_page(out_dir, page, site_host, report)

    check_style_css(out_dir, report)
    check_images(out_dir, report)
    return report


def emit(report: Report, out_dir: Path, ci: bool) -> int:
    for finding in sorted(report.errors + report.warnings, key=lambda item: (item.path, item.line, item.message)):
        if ci:
            level = "error" if finding.severity == "error" else "warning"
            print(f"::{level} file={finding.path},line={max(finding.line, 1)}::{finding.message}")
        else:
            print(finding.render())

    failed = bool(report.errors) or (ci and bool(report.warnings))

    print()
    print(f"hikari-zola static check - {out_dir.as_posix()}")
    print(f"  pages      {report.pages}")
    print(f"  refs       {report.internal_refs} internal, {report.external_refs} external, {report.nav_links} nav links")
    print(
        "  budgets    "
        f"style.css {report.style_bytes / 1024:.1f}/{BUDGET_STYLE // 1024} KiB "
        f"(gzip {report.style_gz_bytes / 1024:.1f}/{BUDGET_STYLE_GZ // 1024} KiB), "
        f"js {report.js_bytes / 1024:.1f}/{BUDGET_JS // 1024} KiB, "
        f"backdrop {report.backdrop_bytes / 1024:.1f}/{BUDGET_BACKDROP // 1024} KiB"
    )
    print(
        "  images     "
        f"{report.image_count} file(s), {report.image_bytes / 1024 / 1024:.1f} MiB total, "
        f"max {report.image_max_bytes / 1024:.1f} KiB ({report.image_max_path or '-'})"
    )

    if report.errors or report.warnings:
        print(f"  result     {len(report.errors)} error(s), {len(report.warnings)} warning(s)")

    if failed:
        print("FAIL")
        return 1

    print("OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Static quality gate for the built hikari-zola site")
    parser.add_argument("--dir", default=DEFAULT_DIR, help=f"build output directory (default: {DEFAULT_DIR})")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help=f"Zola config used to detect the site host (default: {DEFAULT_CONFIG})")
    parser.add_argument("--ci", action="store_true", help="strict mode: GitHub annotations; warnings fail the gate too")
    args = parser.parse_args(argv)

    out_dir = Path(args.dir)
    report = run(out_dir, Path(args.config), args.ci)
    return emit(report, out_dir, args.ci)


if __name__ == "__main__":
    raise SystemExit(main())