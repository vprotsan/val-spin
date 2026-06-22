#!/usr/bin/env python3
"""
Scrape local events from postandcourier.com/journal-scene/events
Usage: python scrape_events.py <number_of_days>
Output: events.csv
"""

import sys
import csv
import json
import datetime

try:
    import requests
    _HAS_REQUESTS = True
except ImportError:
    import urllib.request
    import ssl
    _HAS_REQUESTS = False

API_URL = "https://portal.cityspark.com/api/events/GetEvents/JournalScene"
TAGS_URL = "https://portal.CitySpark.com/PortalScripts/JournalScene"
# Charleston, SC coordinates (center of Journal Scene coverage area)
LAT = 32.78
LNG = -79.94
DISTANCE = 50  # miles
PAGE_SIZE = 100


def fetch_tag_map() -> dict[int, str]:
    """Returns {tag_id: tag_name} from the CitySpark portal widget."""
    try:
        if _HAS_REQUESTS:
            content = requests.get(TAGS_URL, timeout=30).text
        else:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(TAGS_URL, timeout=30, context=ctx) as r:
                content = r.read().decode()

        idx = content.find("cSparkLocals =")
        start = content.index("{", idx)
        depth = 0
        for i, c in enumerate(content[start:]):
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    data = json.loads(content[start : start + i + 1])
                    return {t["id"]: t["name"] for t in (data.get("Tags") or [])}
    except Exception as e:
        print(f"Warning: could not fetch tags ({e})", file=sys.stderr)
    return {}


def _post(payload: dict) -> dict:
    if _HAS_REQUESTS:
        resp = requests.post(API_URL, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()
    else:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return json.load(r)


def fetch_events(start_date: str, end_date: str) -> list[dict]:
    all_events = []
    skip = 0
    while True:
        try:
            data = _post({
                "start": start_date,
                "end": end_date,
                "ppid": 8444,
                "lat": LAT,
                "lng": LNG,
                "distance": DISTANCE,
                "skip": skip,
            })
        except Exception as e:
            print(f"Error fetching events (skip={skip}): {e}", file=sys.stderr)
            break

        batch = data.get("Value") or []
        if not batch:
            break
        all_events.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    return all_events


def event_to_row(event: dict, tag_map: dict[int, str]) -> dict:
    name = event.get("Name", "")

    venue = event.get("Venue") or ""
    city_state = event.get("CityState") or ""
    location = f"{venue}, {city_state}".strip(", ") if venue else city_state

    date_start = event.get("DateStart") or ""
    if date_start:
        dt = datetime.datetime.fromisoformat(date_start.replace("Z", "+00:00"))
        date_str = dt.strftime("%Y-%m-%d")
        time_str = dt.strftime("%I:%M %p").lstrip("0") if event.get("HasTime") else ""
    else:
        date_str = ""
        time_str = ""

    # "More info" link: prefer the link with type=1 (primary), fallback to PrimaryUrl
    links = event.get("Links") or []
    more_info = ""
    for link in links:
        if link.get("type") == 1:
            more_info = link.get("url", "")
            break
    if not more_info:
        more_info = event.get("PrimaryUrl") or ""
        if not more_info and links:
            more_info = links[0].get("url", "")

    tag_ids = event.get("Tags") or []
    tags = ", ".join(tag_map[tid] for tid in tag_ids if tid in tag_map)

    return {
        "name": name,
        "location": location,
        "date": date_str,
        "time": time_str,
        "more_info": more_info,
        "tags": tags,
    }


def main():
    if len(sys.argv) != 2:
        print("Usage: python scrape_events.py <number_of_days>")
        sys.exit(1)

    try:
        days = int(sys.argv[1])
        if days < 1:
            raise ValueError
    except ValueError:
        print("Error: number_of_days must be a positive integer")
        sys.exit(1)

    today = datetime.date.today()
    end = today + datetime.timedelta(days=days - 1)
    start_str = today.isoformat()
    end_str = end.isoformat()

    print("Fetching tag list...")
    tag_map = fetch_tag_map()
    print(f"Loaded {len(tag_map)} tags")

    print(f"Fetching events from {start_str} to {end_str}...")
    events = fetch_events(start_str, end_str)
    print(f"Found {len(events)} events")

    # Filter to date range (API may return some outside range)
    rows = []
    for e in events:
        row = event_to_row(e, tag_map)
        if start_str <= row["date"] <= end_str:
            rows.append(row)

    rows.sort(key=lambda r: (r["date"], r["time"]))

    output_file = "events.csv"
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "location", "date", "time", "more_info", "tags"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved {len(rows)} events to {output_file}")


if __name__ == "__main__":
    main()
