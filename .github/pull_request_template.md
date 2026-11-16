## Summary

What does this change, and why? Link the issue or the design discussion if one
exists.

## Design record

Describe the design decisions here — this description is the design document and the
merged history is the changelog. No `CHANGELOG.md`, no design docs in the tree.

- Files/tokens touched:
- Visual evidence (required for a visual change): screenshots at 360 / 768 / 1280 px,
  light and dark.

## Checklist

- [ ] `zola build` passes locally (`just build`)
- [ ] static gate is clean (`python scripts/check_site.py --ci`)
- [ ] `zola check --skip-external-links` passes; no new dead internal links
- [ ] `celestia-devtools init --check` is clean (`just verify`)
- [ ] only `hk-` class names in templates; no new CSS class invented
- [ ] no external runtime dependency (no CDN, web font, icon pack or framework)
- [ ] budgets: `style.css` <= 64 KiB (gzip <= 13 KiB), theme JS <= 14 KiB, backdrop JS <= 34 KiB
- [ ] one `<h1>` per page; every `<img>` has `width` and `height`; icon-only
      buttons have `aria-label`
- [ ] `prefers-reduced-motion` and dark theme still work
- [ ] commits follow the gitmoji convention and are signed off (`git commit -s`)
- [ ] AI-assistance disclosure included per SySL-1.0 section 2.3