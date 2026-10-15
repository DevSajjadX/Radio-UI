#!/usr/bin/env python3
"""Bundle dist/ into one self-contained HTML file: styles, scripts and fonts are all inlined.

Usage: python3 build-standalone.py [--history N]  ->  writes signal-radio-standalone.html next to this script.
Without /api/stations the page falls back to its preview data, so it also works opened straight from disk.
--history N pads every channel's preview history to N tracks (handy for testing the scrolling list);
dist/ itself is never changed.
"""

import argparse
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
OUT = ROOT / 'signal-radio-standalone.html'


def inline_fonts(css: str) -> str:
    def to_data_uri(match: re.Match) -> str:
        font = DIST / match.group(1).lstrip('./')
        encoded = base64.b64encode(font.read_bytes()).decode('ascii')
        return f'url("data:font/woff2;base64,{encoded}")'

    return re.sub(r'url\("(\./assets/fonts/[^"]+\.woff2)"\)', to_data_uri, css)


# Made-up tracks for --history; they only ever appear in the sample file's preview data.
PAD_HISTORY_JS = """
// sample file only: pad each channel's preview history so the recently played list can be scrolled
{
  const titles = ['Paper Moons', 'Static Bloom', 'Last Ferry', 'Glass Hours', 'Slow Orbit', 'Night Bus',
    'Velour', 'Afterimage', 'Low Light', 'Satellite Hum', 'Copper Sky', 'Overpass', 'Tidewater', 'Soft Focus',
    'Midnight Errand', 'Neon Rain', 'Quiet Signal', 'Long Exposure', 'Golden Hour', 'Echo Park'];
  const artists = ['Juniper Lane', 'The Small Hours', 'Ola Reyes', 'Harbor Lights', 'Mira Vale', 'Coastline',
    'Felix Arden', 'Velvet Static', 'Nadia Sol', 'The Outer Rooms', 'Kite Theory', 'Lena Moor'];
  fallbackData.genres.forEach((genre, g) => {
    let started = Math.min(...genre.history.map((track) => track.started));
    for (let i = genre.history.length; i < __COUNT__; i += 1) {
      started -= 200 + ((i * 37 + g * 11) % 160);
      genre.history.push({ title: titles[(i + g * 3) % titles.length], artist: artists[(i * 5 + g) % artists.length], started });
    }
  });
}
"""


def bundle_scripts(history: int = 0) -> str:
    visualizer = (DIST / 'visualizer.js').read_text()
    app = (DIST / 'app.js').read_text()
    # One module instead of two: drop the import and the export keyword that joined them.
    visualizer = visualizer.replace('export function createVisualizer', 'function createVisualizer', 1)
    app = re.sub(r"^import \{ createVisualizer \} from '\./visualizer\.js';\n", '', app, count=1, flags=re.M)
    if history:
        # right after the preview data is defined, before anything reads it
        app = app.replace('\nconst store = {', PAD_HISTORY_JS.replace('__COUNT__', str(history)) + '\nconst store = {', 1)
    bundle = f'{visualizer}\n{app}'
    # keep the inline script from being closed early by a literal in the code
    return bundle.replace('</script', '<\\/script')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--history', type=int, default=0, metavar='N',
                        help="pad each channel's preview history to N tracks")
    args = parser.parse_args()

    html = (DIST / 'index.html').read_text()
    css = inline_fonts((DIST / 'styles.css').read_text())

    html = html.replace('<link rel="stylesheet" href="./styles.css">', f'<style>\n{css}\n</style>', 1)
    html = html.replace('<script type="module" src="./app.js"></script>',
                        f'<script type="module">\n{bundle_scripts(args.history)}\n</script>', 1)

    for leftover in ('./styles.css', './app.js', './visualizer.js', './assets/'):
        if leftover in html:
            raise SystemExit(f'Not inlined: {leftover}')

    OUT.write_text(html)
    extra = f', {args.history} preview tracks per channel' if args.history else ''
    print(f'Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB{extra})')


if __name__ == '__main__':
    main()
