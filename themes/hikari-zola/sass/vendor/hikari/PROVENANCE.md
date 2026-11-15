# vendor/hikari — provenance

These six-and-a-bit SCSS sheets are **vendored verbatim** from the hikari design
system. They are the token floor of `themes/hikari-zola`; the site's own
palette/typography/layout layers live in `sass/hk/` and only *consume* them.

## Source

| | |
|---|---|
| npm package | `@celestia-island/hikari` |
| version at vendor time | **0.55.255** |
| upstream repo (local checkout used) | `D:\源代码\工程项目\celestia\hikari` |
| license | SySL-1.0 |

## File map (vendored → upstream)

| vendored | upstream |
|---|---|
| `_scale.scss` | `packages/vue/src/scale.scss` |
| `_channels.scss` | `packages/vue/src/theme/channels.scss` |
| `_reset.scss` | `packages/vue/src/styles/reset.scss` |
| `_selection.scss` | `packages/vue/src/styles/selection.scss` |
| `_scrollbar.scss` | `packages/vue/src/styles/theme/scrollbar.scss` |
| `_highlight.scss` | `packages/vue/src/styles/theme/highlight.scss` |
| `_polyfill.scss` | `packages/vue/src/styles/polyfill.scss` |

`_polyfill.scss` is vendored **because the upstream `_selection.scss` does
`@use "./polyfill" as *`** to get the `user-select` prefix mixin; without the
copy the Sass build fails. It emits no CSS on its own (mixins only).

## Sync method

```console
just sync-hikari-tokens     # -> scripts/sync-hikari-tokens.py
```

The script copies the upstream files, prepends the 3-line provenance header and
writes them here. **Never hand-edit these files** — the next sync overwrites
them, and the token names are a public contract for `sass/hk/*`:

* `--color-*` channel triplets (consumed as `rgb(var(--color-primary))`),
* `--space-* / --text-* / --radius-* / --duration-* / --ease-* / --font-*` scale,
* `--hi-* / --c-*` bridge aliases and `--code-*` family *names* (values are
  supplied per theme by `sass/hk/_palette.scss`).

## Composition & overrides

`sass/style.scss` loads them first (scale → channels → reset → selection →
scrollbar → highlight), then the `hk/*` layers. Site overrides are **only**
written in `sass/hk/*` as same-name re-declarations (spec §3):

* palette/tokens → `hk/_palette.scss`
* document base, focus ring, skip link → `hk/_base.scss`
* everything else → the matching `hk/_*.scss` layer.

Deliberate site-side deviations from the vendor defaults are documented in the
theme `README.md` (dark `--color-on-*` flips to the dark ground, selection is
re-enabled on `body`, etc.).

## Trim note

Spec §3 allows trimming `_scrollbar.scss` / `_highlight.scss` (this site has no
overlay-scrollbar DOM and Zola highlights with syntect, not highlight.js), but
both are currently kept **unmodified**: the 64 KB CSS budget absorbs them. If
the budget ever tightens, trim those two sheets first — not the token sheets.
