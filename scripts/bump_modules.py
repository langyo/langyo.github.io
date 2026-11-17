#!/usr/bin/env python3
"""Bump the ES-module cache-busting token everywhere it lives.

The token is written into config.toml ([extra].module_v) and mirrored inside
the module sources so their literal import specifiers stay in lockstep with the
<link rel="modulepreload"> hints. Run this after touching any module file.
"""
import datetime
import io
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.toml"
JS_DIR = ROOT / "themes" / "hikari-zola" / "static" / "js"


def main() -> int:
    old = None
    m = re.search(r'module_v\s*=\s*"([^"]+)"', CONFIG.read_text(encoding="utf-8"))
    if m:
        old = m.group(1)
    new = datetime.datetime.now().strftime("%Y%m%d%H%M")
    if old == new:
        print("token already fresh:", new)
        return 0
    cfg = CONFIG.read_text(encoding="utf-8")
    if old:
        cfg = cfg.replace(old, new)
    else:
        cfg = cfg.replace("[extra]", '[extra]\nmodule_v = "' + new + '"', 1)
    CONFIG.write_text(cfg, encoding="utf-8", newline="")
    touched = 0
    if old:
        for path in JS_DIR.rglob("*.js"):
            src = path.read_text(encoding="utf-8")
            if old in src:
                path.write_text(src.replace(old, new), encoding="utf-8", newline="")
                touched += 1
    print(f"{old or '(none)'} -> {new}; rewrote {touched} module file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
