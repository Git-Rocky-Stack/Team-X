#!/usr/bin/env python3
"""Regenerate the vendored Iosevka subset (audit 2026-10-07 P2-2).

The @fontsource/iosevka "latin" file is not a Latin subset: it carries
~30,000 glyphs (Cyrillic, Greek, math alphanumerics, Braille, legacy
computing, and 130 character-variant / stylistic-set features) in 984 KB.
Team-X sets Iosevka only on refs, ids, timestamps, LCD readouts and code,
so the shipped file keeps Latin, punctuation, arrows, math operators,
technical symbols, box drawing and geometric shapes, plus the default
OpenType layout features. Anything outside the subset falls back to the
next family in the stack (ui-monospace).

Usage (needs fonttools + brotli: `pip install fonttools brotli`):

    python3 scripts/subset-iosevka.py

It downloads the pinned @fontsource/iosevka tarball from the npm registry,
verifies its SHA-256, and writes the subset over the vendored file.
"""

import hashlib
import io
import pathlib
import tarfile
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = "5.2.5"
TARBALL = f"https://registry.npmjs.org/@fontsource/iosevka/-/iosevka-{VERSION}.tgz"
TARBALL_SHA256 = "4f5d3e55d74c4047721af3613eaeb0b527e9917fb98f82afee0fd96ee62fbaf7"
MEMBER = "package/files/iosevka-latin-400-normal.woff2"

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "apps/desktop/src/renderer/src/assets/fonts/iosevka/Iosevka-Regular-latin.woff2"

# Keep in step with the `unicode-range` in styles/fonts/iosevka.css.
UNICODES = [
    "U+0020-007E",  # Basic Latin
    "U+00A0-017F",  # Latin-1 Supplement, Latin Extended-A
    "U+0192,U+02C6,U+02DA,U+02DC",  # florin, modifier circumflex/ring/tilde
    "U+2000-206F",  # General Punctuation (— – … • ’ ·)
    "U+20AC,U+2116,U+2122",  # euro, numero, trademark
    "U+2190-21FF",  # Arrows (→ ↔ ⇄ ⇒)
    "U+2200-22FF",  # Mathematical Operators (≈ ≤ ≥)
    "U+2300-23FF",  # Miscellaneous Technical (⌘ ⏎)
    "U+2500-25FF",  # Box Drawing, Block Elements, Geometric Shapes
    "U+2713-2717",  # check and ballot marks
    "U+FFFD",  # replacement character
]


def main() -> None:
    with urllib.request.urlopen(TARBALL) as response:
        data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != TARBALL_SHA256:
        raise SystemExit(f"tarball SHA-256 {digest} does not match the pinned {TARBALL_SHA256}")

    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        source = tar.extractfile(MEMBER)
        if source is None:
            raise SystemExit(f"{MEMBER} missing from the tarball")
        font_bytes = source.read()

    options = subset.Options()
    options.flavor = "woff2"
    options.name_IDs = ["*"]  # keep the copyright and OFL licence records
    options.notdef_outline = True

    font = TTFont(io.BytesIO(font_bytes))
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(",".join(UNICODES)))
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(OUT)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(font_bytes):,} -> {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
