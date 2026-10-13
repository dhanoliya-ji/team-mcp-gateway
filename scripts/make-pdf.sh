#!/bin/sh
# Make the PDF guide from docs/guide/guide.html, using Edge or Chrome in "headless" mode.
# Usage: sh scripts/make-pdf.sh
HTML="$(pwd)/docs/guide/guide.html"
OUT="$(pwd)/docs/team-mcp-gateway-guide.pdf"
for B in "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/c/Program Files/Google/Chrome/Application/chrome.exe" google-chrome chromium; do
  if command -v "$B" > /dev/null 2>&1 || [ -f "$B" ]; then
    "$B" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")" \
      "file:///$(cygpath -m "$HTML" 2>/dev/null || echo "$HTML")"
    echo "PDF written to $OUT"
    exit 0
  fi
done
echo "No Edge or Chrome found"; exit 1
