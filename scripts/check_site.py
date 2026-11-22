#!/usr/bin/env python3
"""Check static paths, anchors, accessibility basics and the public signup boundary."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text()
css = (ROOT / "styles.css").read_text()


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.anchor_refs = []
        self.attrs = []
        self.files = set()
        self.art = []
        self.external_count = 0
        self.signup_count = 0
        self.headings = {"h1": 0, "h2": 0}
        self.stack = []

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}:
            self.stack.append((tag, attrs))
        assert tag not in {"form", "iframe", "script"}, f"Unexpected active element: {tag}"
        if tag == "html":
            assert attrs.get("lang") == "en"
        if tag == "main":
            assert attrs.get("id") == "main"
        if tag in self.headings:
            self.headings[tag] += 1
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f'Duplicate id {attrs["id"]}'
            self.ids.add(attrs["id"])
        if "aria-labelledby" in attrs:
            self.anchor_refs += attrs["aria-labelledby"].split()
        if "data-waitlist" in attrs:
            self.signup_count += 1
        for prop in ("href", "src"):
            if prop not in attrs:
                continue
            value = attrs[prop]
            parts = urlsplit(value)
            if (parts.scheme or parts.netloc) and not (tag == "a" and value == "https://github.com/newdarwindev/meeting-lab-demo"):
                assert tag == "a" and parts.scheme == "https" and any("data-waitlist" in a for _, a in self.stack)
                assert parts.username is None and parts.password is None
                self.external_count += 1
            if parts.fragment and not parts.path and not parts.netloc:
                self.anchor_refs.append(parts.fragment)
            if parts.path and not parts.scheme and not parts.netloc:
                assert not parts.path.startswith("/") and ".." not in Path(parts.path).parts
                assert (ROOT / parts.path).is_file(), f"Missing asset {parts.path}"
                self.files.add(parts.path)
        if tag == "img":
            assert "alt" in attrs and attrs.get("width") and attrs.get("height")
            if attrs["src"].endswith(".webp"):
                assert attrs["alt"].strip() and (attrs["width"], attrs["height"]) == ("1400", "788")
                data = (ROOT / attrs["src"]).read_bytes()
                assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
                self.art.append(attrs["src"])

    def handle_endtag(self, tag):
        actual, _ = self.stack.pop()
        assert tag == actual, f"Incorrect nesting: expected </{actual}>, got </{tag}>"


page = Document()
page.feed(html)
page.close()
assert not page.stack
assert page.headings["h1"] == 1 and page.headings["h2"] >= 5
assert set(page.anchor_refs) <= page.ids, set(page.anchor_refs) - page.ids
assert len(set(page.art)) == len(page.art) == 5
assert len(re.findall(r"Concept 0[1-5] / 05", html)) == 5
assert page.signup_count == 1 and page.external_count <= 1
for state in ("Fresh", "Stale", "Missing"):
    assert html.count(f"<summary>{state}</summary>") == 1, state
assert html.count('name="teach-back"') == 3
assert "has no event timestamp" in html and "before the rehearsal" in html

assert "styles.css" in page.files and "assets/lab.svg" in page.files
assert "@media(max-width:600px)" in css and "prefers-reduced-motion" in css and "focus-visible" in css
assert html.count("github.com/newdarwindev") == 1 and not re.search(r"\b(?:10|172|192)\.\d+\.\d+\.\d+\b", html)
assert (ROOT / ".nojekyll").exists()
print(f"PASS: HTML nesting, {len(page.anchor_refs)} fragment references, {len(page.art)} WebP images, responsive and reduced-motion rules, {page.external_count} public signup link(s), no client-side form or tracking.")
