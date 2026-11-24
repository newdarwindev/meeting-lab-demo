"""Negative tests for stale, corrupt, extra and mixed-source release inputs."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", required=True, type=Path)
    p.add_argument("--commit", required=True)
    a = p.parse_args()
    gate = Path(__file__).with_name("release_gate.py")

    def invoke(bundle, commit, expect_ok, root=Path.cwd()):
        result = subprocess.run([sys.executable, "-I", str(gate), "verify",
                                 "--bundle", str(bundle), "--commit", commit,
                                 "--root", str(root)], capture_output=True)
        if (result.returncode == 0) != expect_ok:
            raise AssertionError(result.stderr.decode(errors="replace"))

    invoke(a.bundle, a.commit, True)
    invoke(a.bundle, "f" * 40 if a.commit != "f" * 40 else "0" * 40, False)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        broken = root / "broken"
        for mode in ("corrupt", "extra", "missing", "rewritten-manifest"):
            shutil.copytree(a.bundle, broken)
            if mode == "corrupt":
                path = broken / "fixture-reel.png"
                data = bytearray(path.read_bytes())
                data[32] ^= 1
                path.write_bytes(data)
            elif mode == "extra":
                (broken / "unexpected.txt").write_text("not allowed")
            elif mode == "missing":
                (broken / "left-slate.png").unlink()
            else:
                import hashlib
                path = broken / "run.json"
                path.write_text("{}\n")
                manifest = broken / "manifest.json"
                info = json.loads(manifest.read_text())
                info["files"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
                manifest.write_text(json.dumps(info))
            invoke(broken, a.commit, False)
            shutil.rmtree(broken)
        fixture_dir = root / "marketing-fixture"
        fixture_dir.mkdir()
        shutil.copyfile(gate.with_name("recorder.py"), fixture_dir / "recorder.py")
        fixture = json.loads(gate.with_name("storyboard.json").read_text())
        fixture["title"] = "CHANGED FIXTURE"
        (fixture_dir / "storyboard.json").write_text(json.dumps(fixture))
        invoke(a.bundle, a.commit, False, root)
    print("PASS: exact replay; stale commit; corruption; extra; missing; rewritten manifest; crossed fixture")


if __name__ == "__main__":
    main()
