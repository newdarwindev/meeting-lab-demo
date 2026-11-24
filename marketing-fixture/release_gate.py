#!/usr/bin/env python3
"""Offline fixture release gate and Pages package assembly (stdlib only)."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile
import zlib

MEDIA = {"fixture-reel.png", "both-live.png", "left-slate.png", "run.json"}
PAGES = {".nojekyll", "index.html", "business.html", "styles.css", "business.css", "experiment.js"}
MAX_FILE = 8 * 1024 * 1024
PNG = b"\x89PNG\r\n\x1a\n"


def demand(condition, message):
    if not condition:
        raise ValueError(message)


def file_bytes(path):
    demand(path.is_file() and not path.is_symlink(), f"not a regular file: {path.name}")
    demand(0 < path.stat().st_size <= MAX_FILE, f"invalid size: {path.name}")
    return path.read_bytes()


def sha(path):
    return hashlib.sha256(file_bytes(path)).hexdigest()


def png_chunks(path):
    raw = file_bytes(path)
    demand(raw.startswith(PNG), "invalid PNG signature")
    cursor, chunks = len(PNG), []
    while cursor < len(raw):
        demand(cursor + 12 <= len(raw), "truncated PNG")
        size = struct.unpack_from(">I", raw, cursor)[0]
        start, end = cursor + 4, cursor + 8 + size
        demand(end + 4 <= len(raw), "truncated PNG chunk")
        block = raw[start:end]
        demand(zlib.crc32(block) == struct.unpack_from(">I", raw, end)[0], "PNG CRC mismatch")
        chunks.append((block[:4], block[4:]))
        cursor = end + 4
    demand(chunks[0][0] == b"IHDR" and chunks[-1] == (b"IEND", b""), "invalid PNG boundary")
    return chunks


def check_exact_files(path, names):
    demand(path.is_dir() and not path.is_symlink(), "invalid artifact directory")
    demand({entry.name for entry in path.iterdir()} == names, "artifact allowlist mismatch")
    for name in names:
        file_bytes(path / name)


def normalized_commit(value):
    demand(re.fullmatch(r"[0-9a-f]{40}", value) is not None, "expected full Git commit")
    return value


def render(fixture, script, out):
    from subprocess import run
    import sys
    run([sys.executable, "-I", str(script.resolve()), str(fixture.resolve()), str(out.resolve())], check=True)
    check_exact_files(out, MEDIA)


def verify_pixels(bundle):
    # Recorder enforces the scene transition on its rendered RGB frames; this
    # gate also checks the portable image containers and the retained stills.
    reel, before, after = (png_chunks(bundle / x) for x in ("fixture-reel.png", "both-live.png", "left-slate.png"))
    demand(reel[0][1] == before[0][1] == after[0][1], "recording dimensions disagree")
    parts = [v for k, v in reel if k == b"acTL"]
    frames = len([1 for k, _ in reel if k == b"fcTL"])
    demand(len(parts) == 1 and len(parts[0]) == 8, "missing animation control")
    demand(4 <= frames <= 360 and struct.unpack(">II", parts[0])[0] == frames, "invalid frame count")
    demand(sha(bundle / "both-live.png") != sha(bundle / "left-slate.png"), "still images identical")
    return frames


def write_manifest(bundle, commit, fixture, script):
    check_exact_files(bundle, MEDIA)
    info = {
        "kind": "simulated-fixture-recording",
        "source_commit": normalized_commit(commit),
        "fixture_sha256": sha(fixture),
        "recorder_sha256": sha(script),
        "frames": verify_pixels(bundle),
        "files": {name: sha(bundle / name) for name in sorted(MEDIA)},
    }
    (bundle / "manifest.json").write_text(json.dumps(info, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def check_bundle(bundle, commit, fixture, script):
    check_exact_files(bundle, MEDIA | {"manifest.json"})
    expected = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    demand(expected == {
        "kind": "simulated-fixture-recording",
        "source_commit": normalized_commit(commit),
        "fixture_sha256": sha(fixture),
        "recorder_sha256": sha(script),
        "frames": verify_pixels(bundle),
        "files": {name: sha(bundle / name) for name in sorted(MEDIA)},
    }, "manifest, source or artifact hash mismatch")
    # Hashes catch transport errors, not a rewritten manifest. Re-render from
    # the exact checked-out fixtures and compare bytes before packaging.
    with tempfile.TemporaryDirectory() as tmp:
        reference = Path(tmp) / "reference"
        render(fixture, script, reference)
        demand(all(sha(bundle / name) == sha(reference / name) for name in MEDIA), "artifact does not reproduce")


def capture(bundle, commit, fixture, script):
    demand(not bundle.exists(), "refusing to overwrite existing artifact directory")
    with tempfile.TemporaryDirectory() as tmp:
        first, second = Path(tmp) / "a", Path(tmp) / "b"
        render(fixture, script, first)
        render(fixture, script, second)
        demand(all(sha(first / name) == sha(second / name) for name in MEDIA), "nondeterministic output")
        write_manifest(first, commit, fixture, script)
        check_bundle(first, commit, fixture, script)
        shutil.copytree(first, bundle)


def build(root, bundle, out, commit, fixture, script):
    check_bundle(bundle, commit, fixture, script)
    demand(not out.exists(), "refusing to overwrite existing site directory")
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp) / "site"
        stage.mkdir()
        for name in sorted(PAGES):
            path = root / name
            demand(path.is_file() and not path.is_symlink(), f"missing site file: {name}")
            shutil.copyfile(path, stage / name)
        assets = root / "assets"
        demand(assets.is_dir() and not assets.is_symlink(), "missing site assets")
        for path in assets.rglob("*"):
            demand(not path.is_symlink(), "unexpected symbolic link in site assets")
        shutil.copytree(assets, stage / "assets")
        shutil.copytree(bundle, stage / "fixture-media")
        for name in ("index.html", "business.html"):
            path = stage / name
            page = path.read_text(encoding="utf-8")
            demand(page.count("</main>") == 1, "site insertion point is not unique")
            section = '<section class="wrap" id="fixture-proof"><h2>Simulated fixture recording</h2><p><a href="fixture-recording.html">See both feeds and the single-source failure</a>. Generated workspaces; not a live meeting.</p></section>\n'
            path.write_text(page.replace("</main>", section + "</main>"), encoding="utf-8")
        safe_commit = html.escape(commit)
        (stage / "fixture-recording.html").write_text(f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Lab fixture recording</title><style>body{{font:1rem system-ui;margin:2rem auto;padding:0 1rem;max-width:62rem}}img{{max-width:100%;height:auto}}figure{{margin:1rem 0}}</style>
<main><p><a href="index.html?view=terminal">Technical edition</a> · <a href="business.html">Business edition</a></p>
<h1>Two feeds. One source disconnects.</h1>
<p>This is a deterministic recording of mocked dashboards. It contains no live screens, camera, audio or meeting.</p>
<details><summary>Play the looping fixture animation</summary><img loading="lazy" src="fixture-media/fixture-reel.png" alt="Both generated workspace panels move. The left panel becomes a slate; the right one keeps moving."></details>
<figure><img src="fixture-media/both-live.png" alt="Both simulated workspace feeds active"><figcaption>Before: both fixture feeds active.</figcaption></figure>
<figure><img src="fixture-media/left-slate.png" alt="Left simulated feed slated; right simulated feed active"><figcaption>After: only the disconnected source is slated.</figcaption></figure>
<p>Source commit: <code>{safe_commit}</code> · <a href="fixture-media/manifest.json">Recording manifest</a></p></main></html>""", encoding="utf-8")
        shutil.copytree(stage, out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=("capture", "verify", "build"))
    p.add_argument("--bundle", type=Path, required=True)
    p.add_argument("--commit", required=True)
    p.add_argument("--root", type=Path, default=Path.cwd())
    p.add_argument("--out", type=Path)
    args = p.parse_args()
    source = args.root / "marketing-fixture"
    fixture, script = source / "storyboard.json", source / "recorder.py"
    if args.command == "capture":
        capture(args.bundle, args.commit, fixture, script)
    elif args.command == "verify":
        check_bundle(args.bundle, args.commit, fixture, script)
    else:
        demand(args.out is not None, "build requires --out")
        build(args.root, args.bundle, args.out, args.commit, fixture, script)


if __name__ == "__main__":
    main()
