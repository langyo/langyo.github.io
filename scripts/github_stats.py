#!/usr/bin/env python3
"""Fetch and snapshot GitHub activity for the homepage status panel (schema v3).

The site never talks to GitHub at runtime: this script writes a data snapshot
that Zola loads at build time via load_data(path="data/github.json").
Standard library only (urllib + json + re); no third-party dependencies.

Two sources, two scopes
-----------------------
all    Preferred path. Requires GITHUB_TOKEN or GH_TOKEN. Uses the GraphQL
       viewer query for: public/private/total repository counts, followers,
       following, createdAt, and contributionsCollection (total contributions,
       restricted/private contributions, and the 366-day calendar). This scope
       includes private repository counts and private contribution totals, but
       names/descriptions of private repositories are never fetched or stored.
public Fallback path without a usable token: REST API plus the public
       contributions HTML. Private counts are 0 and scope is "public".

Snapshot schema v3 (consumed by templates; keep key names stable)
-----------------------------------------------------------------
    schema, login, fetched_at, scope: "all" | "public",
    profile  {followers, following, created_at}
    repos    {total, public, private}
    totals   {stars, contributions_year, contributions_private_year}
    days     [{d, c}, ...]       366 contribution-calendar days, ascending
    recent28 [{d, c}, ...]      last 28 calendar days
    weeks    [{w, c}, ...]      last 12 calendar weeks (w = that week's Sunday ISO date)
    streak   {current, longest}
    best_day {d, c}
    types    {PUSH, PR, ISSUE, REVIEW}
    top_repos[{name, stars, lang, url}, ...]   public repositories only
    langs    [{l, n}, ...]                     public repositories only

Repos口径 (privacy grouping)
----------------------------
total/public/private come from GraphQL viewer.repositories(ownerAffiliations:
[OWNER]) grouped by the visibility field; totalCount is authoritative for
total. stars, top_repos and langs are computed from PUBLIC repositories only.
The REST /users/{user}/repos listing can surface a few public entries that the
GraphQL owner-affiliation set no longer resolves (renamed/deleted/disabled
repositories); the snapshot deliberately follows the GraphQL privacy grouping.

Downgrade guard
---------------
If data/github.json already holds an all-scope snapshot, a run that can only
produce public scope refuses to overwrite it: it prints an explanation and
exits 0 without touching the file (override with --allow-public-only). CI
without a PAT therefore cannot silently degrade the committed snapshot.

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
    python scripts/github_stats.py                     # write data/github.json
    python scripts/github_stats.py --check             # compare, never write
    python scripts/github_stats.py --allow-public-only # permit a public-scope downgrade

Environment
-----------
GITHUB_TOKEN or GH_TOKEN. Without a token the public fallback needs no auth but
is rate limited to 60 REST requests per hour. Network hiccups are retried 3
times (4 attempts total) with a short backoff. Nothing is written unless the
whole fetch succeeds, so a failed run keeps the previous snapshot.

Exit codes
----------
0 success, refused downgrade, or --check found the snapshot up to date
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

SCHEMA_VERSION = 3
USER = "langyo"
API = "https://api.github.com"
GRAPHQL_URL = API + "/graphql"
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

PROFILE_QUERY = """
query {
  viewer {
    login
    followers { totalCount }
    following { totalCount }
    createdAt
    contributionsCollection {
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""

REPOS_QUERY = """
query($cursor: String) {
  viewer {
    repositories(first: 100, ownerAffiliations: [OWNER], after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { name stargazerCount url visibility primaryLanguage { name } }
    }
  }
}
"""


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def _token() -> str:
    return (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()


def _request_bytes(
    url: str,
    *,
    headers: dict,
    method: str = "GET",
    body: bytes | None = None,
) -> bytes:
    """HTTP request with retries; raises RuntimeError with a readable message."""
    last_error = "unknown error"
    for attempt in range(RETRIES + 1):
        request = urllib.request.Request(url, headers=headers, data=body, method=method)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = "HTTP " + str(exc.code) + " " + str(exc.reason)
            if exc.code not in RETRYABLE_HTTP:
                raise RuntimeError("request to " + url + " failed: " + last_error) from exc
        except (urllib.error.URLError, TimeoutError, ssl.SSLError, ConnectionError, OSError) as exc:
            last_error = type(exc).__name__ + ": " + str(exc)
        if attempt < RETRIES:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        "request to " + url + " failed after " + str(RETRIES + 1) + " attempts: " + last_error
    )


def _auth_headers(accept: str, user_agent: str = UA_API) -> dict:
    headers = {"User-Agent": user_agent, "Accept": accept}
    token = _token()
    if token:
        headers["Authorization"] = "Bearer " + token
    return headers


def fetch_bytes(url: str, *, accept: str, user_agent: str = UA_API) -> bytes:
    return _request_bytes(url, headers=_auth_headers(accept, user_agent))


def fetch_json(url: str):
    raw = fetch_bytes(url, accept="application/vnd.github+json")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("invalid JSON from " + url + ": " + str(exc)) from exc


def graphql(query: str, variables: dict | None = None) -> dict:
    """Run a GitHub GraphQL query; requires a token."""
    if not _token():
        raise RuntimeError("GitHub GraphQL needs GITHUB_TOKEN or GH_TOKEN")
    headers = _auth_headers("application/json")
    headers["Content-Type"] = "application/json"
    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    raw = _request_bytes(GRAPHQL_URL, headers=headers, method="POST", body=payload)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("invalid GraphQL JSON: " + str(exc)) from exc
    errors = data.get("errors") or []
    if errors:
        message = str(errors[0].get("message") or "unknown GraphQL error")
        raise RuntimeError("GraphQL error: " + message)
    payload_data = data.get("data")
    if not isinstance(payload_data, dict):
        raise RuntimeError("GraphQL response has no data")
    return payload_data


# --------------------------------------------------------------------------- #
# GraphQL scope: all (public + private counts / contributions)
# --------------------------------------------------------------------------- #
def graphql_profile() -> dict:
    viewer = graphql(PROFILE_QUERY).get("viewer")
    if not isinstance(viewer, dict) or not viewer.get("login"):
        raise RuntimeError("unexpected GraphQL profile payload")

    collection = viewer.get("contributionsCollection") or {}
    calendar = collection.get("contributionCalendar") or {}
    days = []
    for week in calendar.get("weeks") or []:
        for day in week.get("contributionDays") or []:
            days.append(
                {"d": str(day.get("date") or ""), "c": int(day.get("contributionCount") or 0)}
            )
    days = [day for day in days if day["d"]]
    days.sort(key=lambda day: day["d"])
    days = _dedupe_days(days)
    if len(days) < 300:
        raise RuntimeError(
            "GraphQL contribution calendar returned only " + str(len(days)) + " days"
        )

    return {
        "login": str(viewer.get("login") or USER),
        "followers": int((viewer.get("followers") or {}).get("totalCount") or 0),
        "following": int((viewer.get("following") or {}).get("totalCount") or 0),
        "created_at": str(viewer.get("createdAt") or ""),
        "contributions_year": int(calendar.get("totalContributions") or 0),
        "contributions_private_year": int(collection.get("restrictedContributionsCount") or 0),
        "days": days,
    }


def graphql_repos() -> dict:
    first = graphql(REPOS_QUERY, {"cursor": None}).get("viewer", {}).get("repositories")
    if not isinstance(first, dict):
        raise RuntimeError("unexpected GraphQL repositories payload")

    total = int(first.get("totalCount") or 0)
    nodes = list(first.get("nodes") or [])
    page_info = first.get("pageInfo") or {}
    pages = 1
    while page_info.get("hasNextPage"):
        if pages >= MAX_REPO_PAGES:
            break
        next_page = graphql(REPOS_QUERY, {"cursor": page_info.get("endCursor")})
        page = next_page.get("viewer", {}).get("repositories") or {}
        nodes.extend(page.get("nodes") or [])
        page_info = page.get("pageInfo") or {}
        pages += 1

    seen = set()
    unique = []
    for node in nodes:
        name = str(node.get("name") or "")
        if not name or name in seen:
            continue
        seen.add(name)
        unique.append(node)
    if total and len(unique) != total:
        print(
            "warning: GraphQL returned " + str(len(unique)) + " repo nodes but totalCount is " + str(total),
            file=sys.stderr,
        )

    public_nodes = [node for node in unique if str(node.get("visibility") or "") == "PUBLIC"]
    private_count = sum(1 for node in unique if str(node.get("visibility") or "") == "PRIVATE")
    language_counts = Counter(
        str((node.get("primaryLanguage") or {}).get("name"))
        for node in public_nodes
        if (node.get("primaryLanguage") or {}).get("name")
    )
    ranked = sorted(
        public_nodes,
        key=lambda node: (-int(node.get("stargazerCount") or 0), str(node.get("name") or "")),
    )

    return {
        "total": total or len(unique),
        "public": len(public_nodes),
        "private": private_count,
        "stars": sum(int(node.get("stargazerCount") or 0) for node in public_nodes),
        "top_repos": [
            {
                "name": str(node.get("name") or ""),
                "stars": int(node.get("stargazerCount") or 0),
                "lang": str((node.get("primaryLanguage") or {}).get("name") or ""),
                "url": str(node.get("url") or ""),
            }
            for node in ranked[:5]
        ],
        "langs": [
            {"l": language, "n": count}
            for language, count in sorted(language_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    }


def build_all_snapshot() -> dict:
    profile = graphql_profile()
    repos = graphql_repos()
    metrics = compute_metrics(profile["days"])
    calendar_sum = sum(day["c"] for day in profile["days"])
    if calendar_sum != profile["contributions_year"]:
        print(
            "warning: calendar day sum " + str(calendar_sum) + " differs from totalContributions "
            + str(profile["contributions_year"]),
            file=sys.stderr,
        )
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema": SCHEMA_VERSION,
        "login": profile["login"],
        "fetched_at": fetched_at,
        "scope": "all",
        "profile": {
            "followers": profile["followers"],
            "following": profile["following"],
            "created_at": profile["created_at"],
        },
        "repos": {"total": repos["total"], "public": repos["public"], "private": repos["private"]},
        "totals": {
            "stars": repos["stars"],
            "contributions_year": profile["contributions_year"],
            "contributions_private_year": profile["contributions_private_year"],
        },
        "days": profile["days"],
        "recent28": metrics["recent28"],
        "weeks": metrics["weeks"],
        "streak": metrics["streak"],
        "best_day": metrics["best_day"],
        "types": fetch_activity_types(),
        "top_repos": repos["top_repos"],
        "langs": repos["langs"],
    }


# --------------------------------------------------------------------------- #
# REST/HTML scope: public fallback
# --------------------------------------------------------------------------- #
def fetch_public_profile() -> dict:
    data = fetch_json(API + "/users/" + USER)
    if not isinstance(data, dict) or not data.get("login"):
        raise RuntimeError("unexpected profile payload from the GitHub API")
    return {
        "login": str(data.get("login") or USER),
        "repos": int(data.get("public_repos") or 0),
        "followers": int(data.get("followers") or 0),
        "following": int(data.get("following") or 0),
        "created_at": str(data.get("created_at") or ""),
    }


def fetch_public_repos() -> list:
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


def parse_contributions_html(html: str) -> list:
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
    days = _dedupe_days(days)
    if len(days) < 300:
        raise RuntimeError(
            "contribution calendar parsed only " + str(len(days)) + " days; refusing to write a truncated snapshot"
        )
    return days


def build_public_snapshot() -> dict:
    profile = fetch_public_profile()
    repos_raw = fetch_public_repos()
    html = fetch_bytes(CONTRIBUTIONS_URL, accept="text/html", user_agent=UA_HTML).decode(
        "utf-8", "replace"
    )
    days = parse_contributions_html(html)
    metrics = compute_metrics(days)

    language_counts = Counter(
        str(repo["language"]) for repo in repos_raw if repo.get("language")
    )
    ranked = sorted(
        repos_raw,
        key=lambda repo: (-int(repo.get("stargazers_count") or 0), str(repo.get("full_name") or "")),
    )
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema": SCHEMA_VERSION,
        "login": profile["login"],
        "fetched_at": fetched_at,
        "scope": "public",
        "profile": {
            "followers": profile["followers"],
            "following": profile["following"],
            "created_at": profile["created_at"],
        },
        "repos": {"total": len(repos_raw), "public": len(repos_raw), "private": 0},
        "totals": {
            "stars": sum(int(repo.get("stargazers_count") or 0) for repo in repos_raw),
            "contributions_year": metrics["total"],
            "contributions_private_year": 0,
        },
        "days": days,
        "recent28": metrics["recent28"],
        "weeks": metrics["weeks"],
        "streak": metrics["streak"],
        "best_day": metrics["best_day"],
        "types": fetch_activity_types(),
        "top_repos": [
            {
                "name": str(repo.get("name") or ""),
                "stars": int(repo.get("stargazers_count") or 0),
                "lang": str(repo.get("language") or ""),
                "url": str(repo.get("html_url") or ""),
            }
            for repo in ranked[:5]
        ],
        "langs": [
            {"l": language, "n": count}
            for language, count in sorted(language_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    }


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
def _dedupe_days(days: list) -> list:
    by_date = {}
    for day in days:
        by_date[str(day["d"])] = int(day["c"])
    return [{"d": date_text, "c": by_date[date_text]} for date_text in sorted(by_date)]


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


def build_snapshot() -> dict:
    if _token():
        try:
            return build_all_snapshot()
        except RuntimeError as exc:
            print(
                "warning: GraphQL stats unavailable (" + str(exc) + "); falling back to public scope",
                file=sys.stderr,
            )
    else:
        print("note: no GITHUB_TOKEN/GH_TOKEN; using the public-scope fallback", file=sys.stderr)
    return build_public_snapshot()


# --------------------------------------------------------------------------- #
# Snapshot IO / --check
# --------------------------------------------------------------------------- #
def load_snapshot(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError("cannot read " + str(path) + ": " + str(exc)) from exc
    except json.JSONDecodeError as exc:
        print("warning: existing snapshot is not valid JSON; it will be replaced (" + str(exc) + ")", file=sys.stderr)
        return None
    return data if isinstance(data, dict) else None


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
    repos = snapshot["repos"]
    totals = snapshot["totals"]
    streak = snapshot["streak"]
    print("github stats snapshot (schema " + str(snapshot["schema"]) + ", scope " + snapshot["scope"] + ")")
    print("  login        : " + snapshot["login"])
    print("  fetched_at   : " + snapshot["fetched_at"])
    print(
        "  repos        : total="
        + str(repos["total"])
        + " public="
        + str(repos["public"])
        + " private="
        + str(repos["private"])
    )
    print("  stars (public): " + str(totals["stars"]))
    print(
        "  contributions: "
        + str(totals["contributions_year"])
        + " total / "
        + str(totals["contributions_private_year"])
        + " private, "
        + str(len(snapshot["days"]))
        + " days"
    )
    print(
        "  streak       : current="
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
        print("  top repo     : " + repo["name"] + " stars=" + str(repo["stars"]) + " [" + language + "]")


def main(argv: list) -> int:
    _prepare_console()
    parser = argparse.ArgumentParser(
        description="Fetch the GitHub activity snapshot consumed by the homepage status panel."
    )
    parser.add_argument("--check", action="store_true", help="fetch and compare with data/github.json, never writing it")
    parser.add_argument(
        "--allow-public-only",
        action="store_true",
        help="allow overwriting an all-scope snapshot with a public-scope fallback",
    )
    args = parser.parse_args(argv)

    try:
        snapshot = build_snapshot()
    except RuntimeError as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 1

    if args.check:
        try:
            stored = load_snapshot(SNAPSHOT)
        except RuntimeError as exc:
            print("error: " + str(exc), file=sys.stderr)
            return 1
        if stored is None:
            print("error: snapshot not found: " + str(SNAPSHOT.relative_to(ROOT)), file=sys.stderr)
            return 1
        differing = changed_keys(stored, snapshot)
        if differing:
            print(
                "snapshot is stale: differing top-level keys: " + ", ".join(differing),
                file=sys.stderr,
            )
            if stored.get("scope") == "all" and snapshot.get("scope") != "all":
                print(
                    "hint: a token is required to compare against the all-scope snapshot;"
                    " this run could only produce public scope.",
                    file=sys.stderr,
                )
            return 1
        print("snapshot in sync: " + str(SNAPSHOT.relative_to(ROOT)) + " (fetched_at ignored)")
        return 0

    try:
        stored = load_snapshot(SNAPSHOT)
    except RuntimeError as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 1
    if (
        stored is not None
        and stored.get("scope") == "all"
        and snapshot.get("scope") != "all"
        and not args.allow_public_only
    ):
        print(
            "refusing to overwrite the all-scope snapshot at "
            + str(SNAPSHOT.relative_to(ROOT))
            + " with public-scope data.",
            file=sys.stderr,
        )
        print(
            "hint: set GITHUB_TOKEN/GH_TOKEN for the private-inclusive scope,"
            " or pass --allow-public-only to downgrade deliberately.",
            file=sys.stderr,
        )
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
