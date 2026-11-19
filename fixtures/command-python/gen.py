"""Tiny generator: content/*.md -> out/<name>/index.html (fixture for the command adapter)."""
import pathlib

root = pathlib.Path(__file__).parent
out = root / "out"
for md in sorted((root / "content").glob("*.md")):
    title = md.read_text().splitlines()[0].lstrip("# ")
    target = out / "index.html" if md.stem == "index" else out / md.stem / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"<!doctype html><html lang=\"en\"><head><title>{title}</title></head>"
                      f"<body><main><h1>{title}</h1></main></body></html>\n")
