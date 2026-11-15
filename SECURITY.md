# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report it privately through GitHub Security Advisories:

> https://github.com/langyo/langyo.github.io/security/advisories/new

If advisories are unavailable to you, email langyo.china@gmail.com with a clear
description and reproduction steps. Include (1) the affected component and page,
(2) the attack vector and impact, (3) reproduction steps, (4) suggested mitigations,
and whether you intend to publish.

## Scope

In scope:

- template injection or unsafe use of raw HTML in the Tera templates (XSS);
- broken or missing Content-Security expectations in the deployed site;
- theme JavaScript (theme toggle, drawer, reveal, TOC, backdrop WebGL2) flaws such
  as DOM clobbering or unsafe `innerHTML`;
- build-pipeline and CI issues: workflow token permissions, unpinned third-party
  actions, cache poisoning, dependency confusion in the design-token sync;
- vendored SCSS provenance: a token file silently diverging from the published
  `@celestia-island/hikari` package;
- exposed credentials or personal data committed to this repository.

Out of scope:

- vulnerabilities in browser engines, the GitHub Pages hosting layer or the container
  runtime used to serve the site;
- findings that only affect a fork with modified workflows or configuration;
- reports that consist only of scanner output and were never verified against a
  running build.

## Response targets

| Stage | Target |
|---|---|
| Acknowledgment | 3 calendar days |
| Initial assessment | 7 calendar days |
| Fix or mitigation | 30 calendar days, severity-dependent |

## Supported versions

Only the current default branch (`master`) receives fixes. Feature branches —
including the current `feat/hikari-zola-theme` work — are work in progress and are
not supported; do not report against them.

## What we will not accept

Bulk, machine-generated reports that were never verified against a built site will be
closed without review. This is a deliberate policy against report flooding, not a
dismissal of genuine findings.
