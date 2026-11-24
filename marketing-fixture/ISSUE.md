# Record the Meeting Lab marketing demo from checked-in fixtures and gate the site build

**Goal:** Produce a repeatable recording of two independent simulated workspace feeds. Closing the left source must slate only the left TV while the right feed continues. Package a reel and two stills, preserve the exact source and hashes, and automatically start the website build only after the recording gate passes.

**Non-negotiable input boundary:** Everything the run depicts is precanned or mocked in this repository. No lab computers, RDP, Meet, Zoom, credentials, cameras, microphones, telemetry, model calls, private rooms, mounted workspaces, submodules, package downloads, or live data. The recording and site build operate offline with Python's standard library. GitHub-provided checkout and artifact transfer are transport only. The site must visibly call the recording a simulated fixture, never a recording of a private workspace or proof of live provider acceptance. Existing live assets and Pages settings remain unchanged.

- [ ] A clean checkout generates the same recording twice byte-for-byte, including the standalone stills and fixture metadata.
- [ ] The gate checks the recorded frames: both feeds move before the transition, only the left TV slates, and the right feed keeps moving.
- [ ] Reject missing, extra, modified, oversized or invalid artifacts. Keep the gate and build tied to the exact checkout and run.
- [ ] Store only the verified recording bundle in the named Actions artifact. The website build starts automatically after the gate, retrieves that exact artifact in the same run and verifies it again before building.
- [ ] Build both site editions with a link to the recording. Produce a reviewable website artifact; enable a protected public deployment separately, not from an unreviewed branch. If the recording gate fails, do not build a substitute or touch the live site.
- [ ] Validate with a changed fixture, a corrupt artifact, a stale or crossed commit and a missing file. No hidden external input.

Visual reference: the isolated two-TV failure scenario. No private source or media is an input to this run.
