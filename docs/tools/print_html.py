"""Print an HTML page (e.g. the 2-page pitch) to PDF with headless Microsoft Edge.

Usage (from the repo root):
    python docs/tools/print_html.py docs/pitch/AIAIA-Youth-App-Pitch.html docs/AIAIA-Youth-App-Pitch.pdf
"""
import pathlib
import subprocess
import sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

src = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
subprocess.run([EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={out}", src.as_uri()], check=True, timeout=120)
print("wrote", out, out.stat().st_size, "bytes")
