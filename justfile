# hikari-zola personal site (Zola 0.21) — build / check / publish entry points.
#
# Header conventions are copied from the celestia-island fleet (docs.celestia.world,
# lagrange): bash for POSIX, Windows PowerShell for Windows. Recipes are LINEWISE
# and shell-neutral — one command per line, no "&&" chains, no line continuations —
# so the same file works under bash and PowerShell 5.1 alike. Multi-step logic
# belongs in the repo's Python scripts, never in a shell pipeline.

set shell := ["bash", "-c"]
# Windows: PowerShell (the 5.1 floor ships with every Windows; pwsh 7 is
# NOT assumed). Linewise recipes must stay PS-5.1-safe: no `&&` chains,
# `cd X; cmd` instead of `cd X && cmd`. Bash-only recipes use
# [script('bash')] and need Git Bash (or WSL) when actually run.
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $PSDefaultParameterValues['*:Encoding']='utf8';"]
set unstable
set lists

# Repo definitions override the shared template's (imported above).
set allow-duplicate-recipes
set allow-duplicate-variables

# Shared celestia-devtools recipes — NOT in git. Stage with: just fetch.
# "import?" silently skips when absent, so this justfile parses pre-fetch.
# Do NOT define a local "fetch" recipe: the shared file provides it, and
# "celestia-devtools init --check" fails on a local copy that shadows it.
import? "./.just/celestia-devtools.just"

# Python for the repo's own scripts. The shared file provides "python_cmd", but
# that only exists after the first fetch, so this repo keeps its own variable.
python := if os_family() == "windows" { "python" } else { "python3" }

# celestia-devtools CLI: the installed entry point, or the module fallback.
devtools := if which("celestia-devtools") != "" { "celestia-devtools" } else { python + " -m celestia_devtools" }

# List every recipe (including the shared devtools recipes once staged).
default:
    @just --list

# Build the site into public/ — the artifact CI and the container image consume.
build:
    zola build

# Serve locally with live reload. Extra args pass through: just serve --port 1111
serve *ARGS='':
    zola serve {{ARGS}}

# Article bodies cite the open web, and 403/timeout responses from other sites
# must not fail this repository, so the link check runs internal links only.
# Build, then run the static quality gate and the internal link check.
check: build
    {{python}} scripts/check_site.py
    zola check --skip-external-links

# Full local gate: check + the devtools justfile/workflow drift gate.
verify: check
    {{devtools}} init --check

# Remove build output (public/ plus the scratch _build/ tree).
clean:
    {{python}} -c "import shutil; [shutil.rmtree(d, ignore_errors=True) for d in ('public', '_build')]"

# Format repo-owned TOML and Markdown with the shared devtools recipes.
# Note: this touches config.toml and every Markdown file (content/ included) —
# run it deliberately, it is intentionally NOT part of "just verify".
fmt:
    just fmt-toml
    just fmt-markdown

# Re-vendor the six hikari design-token sheets from @celestia-island/hikari.
# Offline: just sync-hikari-tokens --from ../hikari/packages/vue
sync-hikari-tokens *ARGS='':
    {{python}} scripts/sync-hikari-tokens.py {{ARGS}}

# Refresh the GitHub activity snapshot that feeds the home-page panel.
# Needs network + a GitHub token (CI runs it daily); writes data/github.json.
sync-github *ARGS='':
    {{python}} scripts/github_stats.py {{ARGS}}

# Verify data/github.json exists and is current, without writing it (script --check).
github-check *ARGS='':
    {{python}} scripts/github_stats.py --check {{ARGS}}

# Prepare the theme artwork (crops, dual tone, webp budget) from the source art.
art *ARGS='':
    {{python}} scripts/assets/prepare_art.py {{ARGS}}

# Build the container image (dockerfile) and push it to the personal registry.
publish *args="podman":
    @just _publish_{{args}}

# Publish with Docker.
_publish_docker:
    docker build -t homepage -f ./dockerfile .
    docker tag homepage:latest crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest
    docker push crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest

# Publish with Podman (default).
_publish_podman:
    podman build -t homepage -f ./dockerfile .
    podman tag homepage:latest crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest
    podman push crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest