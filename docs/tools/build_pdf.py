"""Render a Markdown document from docs/ to a styled A4 PDF (via headless Microsoft Edge).

Usage (from the repo root):
    python docs/tools/build_pdf.py docs/AIAIA-Youth-App-Proposal.md docs/AIAIA-Youth-App-Proposal.pdf

Needs: Python 3 with the `markdown` package (`python -m pip install markdown`), and Microsoft Edge.
"""
import pathlib
import re
import subprocess
import sys
import tempfile

try:
    import markdown
except ImportError:
    sys.exit("Missing dependency: run  python -m pip install markdown")

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
LIST = re.compile(r"^( *)([-*]|\d+\.) ")

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1f2933; }
h1 { color: #0b3d6e; font-size: 22pt; margin: 0 0 6pt; border-bottom: 3px solid #c8962e; padding-bottom: 4pt; }
h2 { color: #0b3d6e; font-size: 14pt; margin: 16pt 0 4pt; page-break-after: avoid; }
p, li { margin: 3pt 0; }
ul { list-style-type: disc; }
blockquote { background: #f3f6fa; border-left: 4px solid #c8962e; margin: 8pt 0; padding: 6pt 10pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 10pt; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
th { background: #0b3d6e; color: #fff; text-align: left; }
th, td { border: 1px solid #cfd8e3; padding: 4pt 6pt; vertical-align: top; }
tr:nth-child(even) td { background: #f7f9fc; }
a { color: #0b5cad; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #eef2f6; padding: 0 2pt; }
pre { background: #f3f6fa; border: 1px solid #cfd8e3; border-radius: 4px; padding: 8pt 10pt; margin: 6pt 0 10pt; page-break-inside: avoid; white-space: pre; overflow: hidden; }
pre code { background: none; padding: 0; font-size: 8.3pt; line-height: 1.3; }
h2 + p, h2 + ul, h2 + table { page-break-before: avoid; }
hr { border: 0; border-top: 1px solid #cfd8e3; margin: 12pt 0; }
.page-break { page-break-after: always; }
h1.new-page { page-break-before: always; }
"""


def normalise_lists(text: str) -> str:
    """Python-Markdown needs 4-space nesting and a blank line before a list."""
    out = []
    for line in text.splitlines():
        m = LIST.match(line)
        if m:
            indent = len(m.group(1))
            line = " " * (indent * 2) + line[indent:]
            prev = out[-1] if out else ""
            if prev.strip() and not LIST.match(prev) and not prev.startswith(" "):
                out.append("")
        out.append(line)
    return "\n".join(out)


def main() -> None:
    src = pathlib.Path(sys.argv[1]).resolve()
    out_pdf = pathlib.Path(sys.argv[2]).resolve()
    text = src.read_text(encoding="utf-8")
    first_h1 = re.search(r"^# (.+)$", text, re.M)
    title = first_h1.group(1).strip() if first_h1 else src.stem
    body = markdown.markdown(normalise_lists(text), extensions=["tables", "md_in_html", "fenced_code"])
    html = (f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>'
            f"<style>{CSS}</style></head><body>{body}</body></html>")
    with tempfile.TemporaryDirectory() as tmp:
        html_path = pathlib.Path(tmp) / "doc.html"
        html_path.write_text(html, encoding="utf-8")
        subprocess.run([EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={out_pdf}", html_path.as_uri()], check=True, timeout=120)
    print("wrote", out_pdf, out_pdf.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
