"""Regenerate the SDAR lithology tiles and their previews (requires Inkscape).

Adapted from SDAR 0.9-55, R/patterns.R. See data/SOURCES.md.
SPDX-License-Identifier: GPL-2.0-or-later
"""
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile

DATA = Path(__file__).resolve().parents[1] / "data"


def path(d):
    return f'<path d="{d}" fill="none" stroke="#222" stroke-width="0.15"/>'


def circle(x, y, r, filled=False):
    fill = "#222" if filled else "white"
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="#222" stroke-width="0.12"/>'


def stagger(mark):
    return "".join(f'<g transform="translate({x} {y})">{mark}</g>'
                   for x, y in [(1.5, 1.5), (7.5, 1.5), (4.5, 4.5), (10.5, 4.5)])


# A 12 by 6 mm repeat. Paths use physical coordinates so joining edges align.
beds = path("M0 1.5H12 M0 4.5H12")
tiles = [
    ("sandstone", "Песчаник", "Sandstone", stagger(circle(-.6, -.35, .13, True) + circle(.65, .3, .13, True) + circle(.2, -.65, .13, True))),
    ("conglomerate", "Конгломерат", "Conglomerate", stagger(circle(-.65, .15, .58) + circle(.72, -.43, .24) + circle(.64, .52, .14, True))),
    ("shale", "Глинистый сланец", "Shale", path("M0 1.5H4 M6 1.5h4 M0 4.5h1 M3 4.5h4 M9 4.5h3")),
    ("siltstone", "Алевролит", "Siltstone", path("M1 1.5h3 M7 1.5h3 M0 4.5h1 M4 4.5h3 M10 4.5h2")
        + "".join(circle(x, y, .12, True) for y, xs in [(1.5, (.5, 4.5, 5.5, 6.5, 10.5, 11.5)),
                                                       (4.5, (1.5, 2.5, 3.5, 7.5, 8.5, 9.5))] for x in xs)),
    ("limestone", "Известняк", "Limestone", beds + path("M1.5 0v1.5 M7.5 0v1.5 M4.5 1.5v3 M10.5 1.5v3 M1.5 4.5V6 M7.5 4.5V6")),
    ("dolomite", "Доломит", "Dolomite", beds + path("M1.5 0l.5 1.5 M7.5 0l.5 1.5 M4 1.5l1 3 M10 1.5l1 3 M1 4.5l.5 1.5 M7 4.5l.5 1.5")),
    ("chalk", "Мел", "Chalk", stagger(path("M-1.3 0h2.6 M-.6 0v-.9"))),
    ("halite", "Каменная соль (галит)", "Halite", beds + path("M1.5 0v6 M4.5 0v6 M7.5 0v6 M10.5 0v6")),
    ("phosphorite", "Фосфорит", "Phosphorite", "".join(circle(x, y, .45, True) for x in (1.5, 4.5, 7.5, 10.5) for y in (1.5, 4.5))),
    ("diatomite", "Диатомит", "Diatomite", stagger(path("M-1.4 -.28h2.8 M-1.4 .28h2.8") + circle(0, 0, .52))),
    ("tuff", "Туф", "Tuff", stagger(path("M-.57 -.57l1.14 1.14 M-.57 .57L.57 -.57"))),
    ("igneous", "Магматическая порода", "Igneous rock", stagger(path("M-.75 0h1.5 M0 -.75v1.5"))),
    ("limonite", "Лимонит", "Limonite", stagger(circle(0, 0, .78) + path("M-.26 -.26h.52v.52h-.52Z"))),
    ("siderite", "Сидерит", "Siderite", stagger(circle(0, 0, .72) + path("M-.72 0H.72 M0 -.72V.72"))),
    ("chert", "Кремень", "Chert", stagger(path("M-.75 -.45h1.5L0 .72Z"))),
    ("marl", "Мергель", "Marl", stagger(path("M-1.1 .18Q-.55 -.58 0 0T1.1 -.18"))),
    ("gypsum", "Гипс", "Gypsum", stagger(path("M-.68 -.62L.68 0l-1.36 .62"))),
    ("lapillistone", "Лапиллиевая порода", "Lapillistone", stagger(path("M-.74 .5L0 -.5l.74 1"))),
    ("basalt", "Базальт", "Basalt", stagger(path("M-.34 -.85L0 .85l.34 -1.7"))),
]


def svg(width, height, drawing):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{height}mm" '
            f'viewBox="0 0 {width} {height}"><rect width="{width}" height="{height}" fill="white"/>'
            + drawing + '</svg>').encode()


def build():
    with TemporaryDirectory() as temp, ZipFile(DATA / "sdar.zip", "w", ZIP_DEFLATED) as archive:
        folder = Path(temp)
        with ZipFile(folder / "previews.zip", "w", ZIP_DEFLATED) as previews:
            with ZipFile(DATA / "previews.zip") as old:
                for info in old.infolist():
                    if not info.filename.startswith("sdar/"):
                        previews.writestr(info, old.read(info))
            rows = []
            for key, ru, en, drawing in tiles:
                name = f"sdar/{key}.svg"
                archive.writestr(name, svg(12, 6, drawing))
                rows.append(f"{name}\t{ru} / {en}\t12\n")
                sample = "".join(f'<g transform="translate({x} {y})">{drawing}</g>'
                                 for x in (0, 12) for y in (0, 6, 12))
                (folder / "sample.svg").write_bytes(svg(24, 18, sample))
                png = folder / "sample.png"
                run(["inkscape", str(folder / "sample.svg"), "-w", "160", "-o", str(png)], check=True)
                previews.write(png, name + ".png")
        (DATA / "previews.zip").write_bytes((folder / "previews.zip").read_bytes())
        (DATA / "sdar.tsv").write_text("".join(rows), encoding="utf-8")


if __name__ == "__main__":
    build()
