"""Build the Corel add-on and the full reproducible source bundle."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
out = root / "artifacts"
out.mkdir(exist_ok=True)
with ZipFile(out / "StrataDraw-CorelDRAW2025.zip", "w", ZIP_DEFLATED) as package:
    for file in sorted((root / "addon").iterdir()):
        package.write(file, "StrataDraw/" + file.name)
    for file in sorted((root / "src/Panel/bin/Release/net48").glob("*.dll")):
        package.write(file, "StrataDraw/" + file.name)
    for file in sorted((root / "data").iterdir()):
        package.write(file, "StrataDraw/data/" + file.name)
    for name in ("LICENSE", "README.md"):
        package.write(root / name, name)
    package.write(root / "scripts/Check-Corel.ps1", "Check-Corel.ps1")

with ZipFile(out / "StrataDraw-project.zip", "w", ZIP_DEFLATED) as package:
    sources = [root / name for name in ("README.md", "LICENSE", ".gitignore", "global.json", "NuGet.Config")]
    for name in ("addon", "scripts", "src", "tests", "data"):
        sources.extend(f for f in (root / name).rglob("*") if f.is_file()
                       and not {"bin", "obj", "__pycache__"}.intersection(f.relative_to(root).parts))
    for file in sorted(sources):
        package.write(file, Path("strata-draw") / file.relative_to(root))
