#!/usr/bin/env python3
"""Fetch and snapshot GitHub activity for the homepage status panel.

The site never talks to GitHub at runtime: this script writes a data snapshot
that Zola loads at build time via load_data(path="data/github.json").
Standard library only (urllib + json + re); no third-party dependencies.

Data sources
------------
* GitHub REST API:
    /users/langyo                 -> login, public_repos, followers, following, created_at
    /users/langyo/repos?per_page=100&page=N   (paginated until empty)
                                  -> stars total, language distribution, top 5 by stars
    /users/langyo/events/public   (optional, first 3 pages only)
                                  -> PUSH / PR / ISSUE / REVIEW counts in the last 90 days
* Public contributions calendar HTML:
    https://github.com/users/langyo/contributions
                                  -> 366 (date, count) pairs used for the heatmap,
                                     recent 28 days, last 12 weeks, streaks and best day.

Snapshot schema (stable; consumed by templates, do not rename keys)
-------------------------------------------------------------------
    login, fetched_at,
    profile   {public_repos, followers, following, created_at}
    totals    {stars, repos_scanned, contributions_year}
    days      [{d, c}, ...]     one entry per calendar day, ascending by date
    recent28  [{d, c}, ...]     last 28 calendar days
    weeks     [{w, c}, ...]     last 12 calendar weeks (w = ISO date of that week's Sunday)
    streak    {current, longest}
    best_day  {d, c}
    types     {PUSH, PR, ISSUE, REVIEW}
    top_repos [{name, full, stars, lang, desc, url}, ...]
    langs     [{l, n}, ...]

Definitions
-----------
* current streak: consecutive contribution days ending on the newest day in the
  calendar; 0 when that day has no contributions.
* longest streak: longest run of consecutive days with at least one contribution.
* best day: highest daily count; ties resolve to the earliest date.
* types: /events/public only exposes a bounded window of recent events, so the
  counts describe the recent activity available through that endpoint.

Usage
-----
    python scripts/github_stats.py            # fetch and write data/github.json
    python scripts/github_stats.py --check    # fetch, compare with the snapshot, never write

Environment
-----------
GITHUB_TOKEN or GH_TOKEN is optional. Without a token the REST API is limited
to 60 requests per hour, which is enough for a handful of runs. Network hiccups
are retried 3 times (4 attempts total) with a short backoff. Nothing is written
unless the whole fetch succeeds, so a failed run keeps the previous snapshot.

Exit codes
----------
0 success / --check found the snapshot up to date
1 fetch or parse failure, missing snapshot for --check, or --check mismatch
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data" / "github.json"

USER = "langyo"
API = "https://api.github.com"
CONTRIBUTIONS_URL = "https://github.com/users/" + USER + "/contributions"

UA_API = "hikari-zola-stats/1.0 (+https://langyo.xyz)"
UA_HTML = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

TIMEOUT = 30
RETRIES = 3  # retries after the first attempt
MAX_REPO_PAGES = 20
MAX_EVENT_PAGES = 3
EVENT_WINDOW_DAYS = 90
RETRYABLE_HTTP = frozenset({408, 425, 429, 500, 502, 503, 504})

TD_RE = re.compile(r'<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>')
TD_ID_RE = re.compile(r'\bid="(contribution-day-component-\d+-\d+)"')
TIP_RE = re.compile(
    r'<tool-tip\b[^>]*\bfor="(contribution-day-component-\d+-\d+)"[^>]*>(.*?)</tool-tip>',
    re.S,
)
TIP_COUNT_RE = re.compile(r"(\d+)\s+contribution")
TIP_TAG_RE = re.compile(r"<[^>]+>")

EVENT_BUCKETS = {
    "PushEvent": "PUSH",
    "PullRequestEvent": "PR",
    "IssuesEvent": "ISSUE",
    "PullRequestReviewEvent": "REVIEW",
}


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def _token() -> str:
    return (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()


def fetch_bytes(url: str, *, accept: str, user_agent: str) -> bytes:
    """GET url with retries; raises RuntimeError with a readable message."""
    headers = {"User-Agent": user_agent, "Accept": accept}
    token = _token()
    if token:
        headers["Authorization"] = "Bearer " + token
    last_error = "unknown error"
    for attempt in range(RETRIES + 1):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = "HTTP " + str(exc.code) + " " + str(exc.reason)
            if exc.code not in RETRYABLE_HTTP:
                raise RuntimeError("GET " + url + " failed: " + last_error) from exc
        except (urllib.error.URLError, TimeoutError, ssl.SSLError, ConnectionError, OSError) as exc:
            last_error = type(exc).__name__ + ": " + str(exc)
        if attempt < RETRIES:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        "GET " + url + " failed after " + str(RETRIES + 1) + " attempts: " + last_error
    )


def fetch_json(url: str):
    raw = fetch_bytes(url, accept="application/vnd.github+json", user_agent=UA_API)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("invalid JSON from " + url + ": " + str(exc)) from exc


# --------------------------------------------------------------------------- #
# Sources
# --------------------------------------------------------------------------- #
def fetch_profile() -> dict:
    data = fetch_json(API + "/users/" + USER)
    if not isinstance(data, dict) or not data.get("login"):
        raise RuntimeError("unexpected profile payload from the GitHub API")
    return {
        "login": str(data.get("login") or USER),
        "public_repos": int(data.get("public_repos") or 0),
        "followers": int(data.get("followers") or 0),
        "following": int(data.get("following") or 0),
        "created_at": str(data.get("created_at") or ""),
    }


def fetch_repos() -> list:
    repos = []
    seen = set()
    for page in range(1, MAX_REPO_PAGES + 1):
        url = API + "/users/" + USER + "/repos?per_page=100&page=" + str(page)
        batch = fetch_json(url)
        if not isinstance(batch, list):
            raise RuntimeError("unexpected repos payload from the GitHub API (page " + str(page) + ")")
        if not batch:
            break
        for item in batch:
            full = str(item.get("full_name") or item.get("name") or "")
            if not full or full in seen:
                continue
            seen.add(full)
            repos.append(item)
        if len(batch) < 100:
            break
    return repos


def parse_contributions(html: str) -> list:
    """Return [{'d': 'YYYY-MM-DD', 'c': n}] parsed from the contribution calendar."""
    counts_by_id = {}
    for match in TIP_RE.finditer(html):
        text = TIP_TAG_RE.sub("", match.group(2))
        count_match = TIP_COUNT_RE.search(text)
        counts_by_id[match.group(1)] = int(count_match.group(1)) if count_match else 0

    day_by_id = {}
    for match in TD_RE.finditer(html):
        id_match = TD_ID_RE.search(match.group(0))
        if id_match:
            day_by_id[id_match.group(1)] = match.group(1)

    if not day_by_id:
        raise RuntimeError("could not parse the contribution calendar (no day cells found)")

    by_date = {}
    for cell_id, date_text in day_by_id.items():
        by_date[date_text] = counts_by_id.get(cell_id, 0)

    days = [{"d": date_text, "c": by_date[date_text]} for date_text in sorted(by_date)]
    if len(days) < 300:
        raise RuntimeError(
            "contribution calendar parsed only " + str(len(days)) + " days; refusing to write a truncated snapshot"
        )
    return days


def fetch_activity_types() -> dict:
    """Best-effort PUSH/PR/ISSUE/REVIEW counts; any failure degrades to zeros."""
    zeros = {"PUSH": 0, "PR": 0, "ISSUE": 0, "REVIEW": 0}
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_WINDOW_DAYS)
    counts = Counter()
    try:
        for page in range(1, MAX_EVENT_PAGES + 1):
            url = API + "/users/" + USER + "/events/public?per_page=100&page=" + str(page)
            events = fetch_json(url)
            if not isinstance(events, list):
                raise RuntimeError("unexpected events payload")
            if not events:
                break
            for event in events:
                try:
                    when = datetime.strptime(
                        str(event.get("created_at") or ""), "%Y-%m-%dT%H:%M:%SZ"
                    ).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                if when < cutoff:
                    continue
                bucket = EVENT_BUCKETS.get(str(event.get("type") or ""))
                if bucket:
                    counts[bucket] += 1
            if len(events) < 100:
                break
        zeros.update({key: counts.get(key, 0) for key in zeros})
        return zeros
    except RuntimeError as exc:
        print("warning: public events unavailable (" + str(exc) + "); types set to 0", file=sys.stderr)
        return zeros


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def week_start(day: date) -> date:
    """Sunday that starts the calendar week containing day."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


def compute_metrics(days: list) -> dict:
    total = sum(day["c"] for day in days)

    week_sums = {}
    for day in days:
        sunday = week_start(date.fromisoformat(day["d"]))
        week_sums[sunday] = week_sums.get(sunday, 0) + day["c"]
    weeks = [{"w": sunday.isoformat(), "c": week_sums[sunday]} for sunday in sorted(week_sums)[-12:]]

    current = 0
    for day in reversed(days):
        if day["c"] > 0:
            current += 1
        else:
            break

    longest = 0
    run = 0
    for day in days:
        run = run + 1 if day["c"] > 0 else 0
        longest = max(longest, run)

    best = max(days, key=lambda day: (day["c"], -date.fromisoformat(day["d"]).toordinal()))

    return {
        "total": total,
        "recent28": days[-28:],
        "weeks": weeks,
        "streak": {"current": current, "longest": longest},
        "best_day": {"d": best["d"], "c": best["c"]},
    }


# --------------------------------------------------------------------------- #
# Snapshot assembly
# --------------------------------------------------------------------------- #
def build_snapshot() -> dict:
    profile = fetch_profile()
    repos = fetch_repos()

    stars = sum(int(repo.get("stargazers_count") or 0) for repo in repos)
    language_counts = Counter(
        str(repo["language"]) for repo in repos if repo.get("language")
    )
    langs = [
        {"l": language, "n": count}
        for language, count in sorted(language_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    ranked = sorted(
        repos,
        key=lambda repo: (-int(repo.get("stargazers_count") or 0), str(repo.get("full_name") or "")),
    )
    top_repos = [
        {
            "name": str(repo.get("name") or ""),
            "full": str(repo.get("full_name") or ""),
            "stars": int(repo.get("stargazers_count") or 0),
            "lang": str(repo.get("language") or ""),
            "desc": str(repo.get("description") or ""),
            "url": str(repo.get("html_url") or ""),
        }
        for repo in ranked[:5]
    ]

    html = fetch_bytes(CONTRIBUTIONS_URL, accept="text/html", user_agent=UA_HTML).decode(
        "utf-8", "replace"
    )
    days = parse_contributions(html)
    metrics = compute_metrics(days)

    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "login": profile["login"],
        "fetched_at": fetched_at,
        "profile": {
            "public_repos": profile["public_repos"],
            "followers": profile["followers"],
            "following": profile["following"],
            "created_at": profile["created_at"],
        },
        "totals": {
            "stars": stars,
            "repos_scanned": len(repos),
            "contributions_year": metrics["total"],
        },
        "days": days,
        "recent28": metrics["recent28"],
        "weeks": metrics["weeks"],
        "streak": metrics["streak"],
        "best_day": metrics["best_day"],
        "types": fetch_activity_types(),
        "top_repos": top_repos,
        "langs": langs,
    }


# --------------------------------------------------------------------------- #
# --check
# --------------------------------------------------------------------------- #
def load_snapshot(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError("cannot read " + str(path) + ": " + str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("snapshot is not valid JSON: " + str(exc)) from exc


def changed_keys(stored: dict, fresh: dict) -> list:
    stored_cmp = {key: value for key, value in stored.items() if key != "fetched_at"}
    fresh_cmp = {key: value for key, value in fresh.items() if key != "fetched_at"}
    if stored_cmp == fresh_cmp:
        return []
    return [
        key
        for key in sorted(set(stored_cmp) | set(fresh_cmp))
        if stored_cmp.get(key) != fresh_cmp.get(key)
    ]


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _prepare_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, OSError, ValueError):
            pass


def print_summary(snapshot: dict) -> None:
    profile = snapshot["profile"]
    totals = snapshot["totals"]
    streak = snapshot["streak"]
    print("github stats snapshot")
    print("  login        : " + snapshot["login"])
    print("  fetched_at   : " + snapshot["fetched_at"])
    print(
        "  repos/stars  : "
        + str(totals["repos_scanned"])
        + " scanned, "
        + str(totals["stars"])
        + " stars"
    )
    print(
        "  profile      : public_repos="
        + str(profile["public_repos"])
        + " followers="
        + str(profile["followers"])
        + " following="
        + str(profile["following"])
        + " created="
        + profile["created_at"]
    )
    print(
        "  contributions: "
        + str(totals["contributions_year"])
        + " in "
        + str(len(snapshot["days"]))
        + " days | streak current="
        + str(streak["current"])
        + " longest="
        + str(streak["longest"])
        + " | best="
        + str(snapshot["best_day"]["c"])
        + " on "
        + snapshot["best_day"]["d"]
    )
    types = snapshot["types"]
    print(
        "  events       : PUSH="
        + str(types["PUSH"])
        + " PR="
        + str(types["PR"])
        + " ISSUE="
        + str(types["ISSUE"])
        + " REVIEW="
        + str(types["REVIEW"])
    )
    for repo in snapshot["top_repos"][:3]:
        language = repo["lang"] or "n/a"
        print("  top repo     : " + repo["full"] + " stars=" + str(repo["stars"]) + " [" + language + "]")


def main(argv: list) -> int:
    _prepare_console()
    parser = argparse.ArgumentParser(
        description="Fetch the GitHub activity snapshot consumed by the homepage status panel."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="fetch and compare with data/github.json, never writing it",
    )
    args = parser.parse_args(argv)

    try:
        snapshot = build_snapshot()
    except RuntimeError as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 1

    if args.check:
        if not SNAPSHOT.is_file():
            print("error: snapshot not found: " + str(SNAPSHOT.relative_to(ROOT)), file=sys.stderr)
            return 1
        try:
            stored = load_snapshot(SNAPSHOT)
        except RuntimeError as exc:
            print("error: " + str(exc), file=sys.stderr)
            return 1
        differing = changed_keys(stored, snapshot)
        if differing:
            print(
                "snapshot is stale: differing top-level keys: " + ", ".join(differing),
                file=sys.stderr,
            )
            return 1
        print("snapshot in sync: " + str(SNAPSHOT.relative_to(ROOT)) + " (fetched_at ignored)")
        return 0

    text = json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(text, encoding="utf-8", newline="\n")
    print_summary(snapshot)
    print(
        "  bytes        : "
        + str(SNAPSHOT.stat().st_size)
        + " -> "
        + str(SNAPSHOT.relative_to(ROOT))
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
