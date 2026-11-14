# Document tools

These scripts regenerate the shareable PDFs after you edit their sources. Run them from the repo root on Windows. You need Python 3 and Microsoft Edge.

One-time setup:

```powershell
python -m pip install markdown
```

| PDF | Source | Command |
|---|---|---|
| Proposal (plain language) | `docs/AIAIA-Youth-App-Proposal.md` | `python docs/tools/build_pdf.py docs/AIAIA-Youth-App-Proposal.md docs/AIAIA-Youth-App-Proposal.pdf` |
| Technical Sheet | `docs/AIAIA-Youth-App-Technical-Sheet.md` | `python docs/tools/build_pdf.py docs/AIAIA-Youth-App-Technical-Sheet.md docs/AIAIA-Youth-App-Technical-Sheet.pdf` |
| Build Timeline | `docs/build/06-timeline.md` | `python docs/tools/build_pdf.py docs/build/06-timeline.md docs/AIAIA-Youth-App-Build-Timeline.pdf` |
| 2-page Pitch (landscape) | `docs/pitch/AIAIA-Youth-App-Pitch.html` | `python docs/tools/print_html.py docs/pitch/AIAIA-Youth-App-Pitch.html docs/AIAIA-Youth-App-Pitch.pdf` |

The pitch has a fixed 2-page layout, so open the PDF after editing it. If page 2 overflows, shorten the text or tighten the `.p2` styles.
