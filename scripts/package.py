"""Assemble the layouts expected by CorelDRAW and by the project setup script."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
out = root / "artifacts"
out.mkdir(exist_ok=True)
with ZipFile(out / "StrataDraw-CorelDRAW2025.zip", "w", ZIP_DEFLATED) as package:
    for file in sorted((root / "addon").iterdir()):
        package.write(file, "StrataDraw/" + file.name)
    package.write(root / "src/Panel/bin/Release/net48/StrataDraw.dll", "StrataDraw/StrataDraw.dll")
    for name in ("LICENSE", "README.md"):
        package.write(root / name, name)

with ZipFile(out / "StrataDraw-project.zip", "w", ZIP_DEFLATED) as package:
    sources = [root / name for name in ("README.md", "LICENSE", ".gitignore", "global.json", "NuGet.Config")]
    for name in ("addon", "scripts", "src", "tests"):
        sources.extend(f for f in (root / name).rglob("*") if f.is_file()
                       and not {"bin", "obj", "__pycache__"}.intersection(f.relative_to(root).parts))
    for file in sorted(sources):
        package.write(file, Path("strata-draw") / file.relative_to(root))
