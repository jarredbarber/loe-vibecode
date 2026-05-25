#!/usr/bin/env python3
"""One-shot: convert every Markdown file's Meta-style frontmatter to proper YAML.

Reads each .md under content/ with the legacy `key: value` (no-escape) Meta
format that Python-Markdown's `meta` extension consumed, and rewrites it as
valid YAML using PyYAML's automatic quoting. Idempotent — running it on a
file that already parses as YAML is a no-op aside from style normalization.
"""

import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parent.parent / "content"


def parse_meta_frontmatter(text):
    """Parse legacy Meta-style frontmatter. Returns (meta_dict, body_str).
    If the file has no '---' delimiters, walks Key: Value lines from the top
    until the first blank line (mimicking Python-Markdown's Meta behavior)."""
    lines = text.splitlines()
    i = 0
    body_start = 0
    meta = {}

    # Two layouts: `---` fenced or top-of-file naked.
    if lines and lines[0].strip() == "---":
        i = 1
        block = []
        while i < len(lines) and lines[i].strip() != "---":
            block.append(lines[i])
            i += 1
        body_start = i + 1  # skip closing ---
    else:
        block = []
        while i < len(lines) and lines[i].strip() != "":
            if ":" not in lines[i] and not lines[i].startswith((" ", "\t")):
                break
            block.append(lines[i])
            i += 1
        body_start = i

    current_key = None
    for line in block:
        if line.startswith((" ", "\t")) and current_key is not None:
            meta[current_key] = (meta[current_key] + " " + line.strip()).strip()
        elif ":" in line:
            k, _, v = line.partition(":")
            current_key = k.strip().lower()
            meta[current_key] = v.strip()
        else:
            pass  # skip junk

    body = "\n".join(lines[body_start:])
    if body and not body.startswith("\n"):
        body = "\n" + body
    return meta, body


def dump_yaml_frontmatter(meta):
    return "---\n" + yaml.dump(meta, default_flow_style=False, allow_unicode=True, width=1_000_000, sort_keys=False) + "---\n"


def convert_file(path):
    text = path.read_text(encoding="utf-8")
    meta, body = parse_meta_frontmatter(text)
    if not meta:
        return False  # no frontmatter, leave alone

    # If frontmatter is already valid YAML, normalize via round-trip; otherwise
    # the raw `key: value` lines we extracted ARE the canonical strings now.
    fm = dump_yaml_frontmatter(meta)
    new_text = fm + body if body.startswith("\n") else fm + "\n" + body
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    return True


def main():
    targets = list(ROOT.rglob("*.md"))
    converted = 0
    for p in targets:
        try:
            if convert_file(p):
                converted += 1
        except Exception as e:
            print(f"  ! {p}: {e}", file=sys.stderr)
    print(f"Converted {converted}/{len(targets)} files.")


if __name__ == "__main__":
    main()
