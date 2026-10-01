#!/usr/bin/env python3
"""Generate a v2 matrix from exported issues labeled device-test (no network I/O).

Export with: gh issue list --label device-test --state all --limit 1000 \
    --json number,body,labels > reports.json
Then: python3 scripts/generate-device-compatibility.py reports.json \
    --output docs/device-compatibility-v2.md
"""
import argparse
import html
import json
from pathlib import Path
import re

METADATA = ("TV model", "Firmware", "webOS version", "Architecture",
            "Rooted or unrooted", "Install method", "App build SHA/version")
GROUPS = (
    ("Playback", ("Starts", "Relaunches", "VOD", "Shorts", "Live", "Seek", "Pause/resume")),
    ("Codecs and display", ("H264", "VP9", "AV1", "1080p", "1440p", "2160p", "HDR10", "HLG")),
    ("Rates", ("1.25x", "1.5x", "2x")),
)
RESULTS = {"Pass", "Fail", "Not tested", "Not supported"}


def sections(body):
    matches = list(re.finditer(r"^### ([^\n]+)\s*$", body, re.MULTILINE))
    result = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        title = match.group(1).strip()
        if title in result:
            raise ValueError(f"Duplicate form section: {title}")
        result[title] = body[match.end():end].strip()
    return result


def cell(value):
    value = re.sub(r"https?://\S+", "[redacted URL]", value, flags=re.IGNORECASE)
    value = re.sub(r"(?i)\b(authorization|cookie|oauth|account|token|password|secret)\s*[:=].*",
                   "[redacted sensitive field]", value)
    value = " ".join(value.split())[:120]
    value = html.escape(value)
    for character in ("\\", "|", "*", "_", "`", "[", "]"):
        value = value.replace(character, "\\" + character)
    return value or "Not reported"


def table(columns, rows):
    lines = ["| " + " | ".join(columns) + " |",
             "| " + " | ".join("---" for _ in columns) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines)


def generate(issues, repository):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Expected owner/repository")
    if not isinstance(issues, list):
        raise ValueError("Expected a JSON issue list")
    reports, seen = [], set()
    for issue in issues:
        labels = {label if isinstance(label, str) else label.get("name", "")
                  for label in issue.get("labels", [])}
        if "device-test" not in labels:
            continue
        number = issue.get("number")
        if type(number) is not int or number <= 0 or number in seen:
            raise ValueError("Invalid or duplicate issue number")
        seen.add(number)
        data = sections(issue.get("body") or "")
        reports.append((number, data))
    reports.sort()
    intro = """# Device compatibility: v2

Generated from labeled device-test reports. Each row is a user observation for
one TV/firmware/build, not a guarantee for a model family. Pass, Fail, Not tested
and Not supported are distinct. Missing or unrecognized results are Not reported.
No reports means no claimed verified hardware. Host tests and SDK declarations
do not establish device playback compatibility.

Export issues using the command in `scripts/generate-device-compatibility.py`
and regenerate this file. Reports preserve their source issue and exact build;
they are not merged across firmware or app versions.
"""
    if not reports:
        return intro + "\nNo labeled device reports have been imported yet.\n"
    reference = lambda number: f"[#{number}](https://github.com/{repository}/issues/{number})"
    output = [intro, "## Devices\n", table(("Report",) + METADATA,
        [[reference(number)] + [cell(data.get(field, "")) for field in METADATA]
         for number, data in reports])]
    for name, fields in GROUPS:
        rows = [[reference(number)] + [data[field] if data.get(field) in RESULTS else "Not reported"
                                      for field in fields] for number, data in reports]
        output += [f"\n## {name}\n", table(("Report",) + fields, rows)]
    return "\n".join(output) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", type=Path)
    parser.add_argument("--repository", default="danzig666/youtube-webos-cobalt-adfree")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    content = generate(json.loads(args.reports.read_text()), args.repository)
    if args.output:
        args.output.write_text(content)
    else:
        print(content, end="")


if __name__ == "__main__":
    main()
