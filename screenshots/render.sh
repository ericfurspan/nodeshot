#!/bin/sh
# Rasterize the Chrome Web Store listing assets from their HTML sources.
# Listing-only assets: nothing here ships inside the extension zip.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "render.sh: Chrome not found at $CHROME" >&2
  echo "Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

render() {
  "$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
    --hide-scrollbars --window-size="$2","$3" \
    --screenshot="$1.png" "file://$PWD/$1.html" >/dev/null 2>&1
  echo "$1.png  ${2}x${3}"
}

render promo-marquee 1400 560
render promo-small     440 280
