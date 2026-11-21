#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/activate.sh
dotnet build src/Panel/Panel.csproj -c Release --no-restore
dotnet run --project tests/Check.csproj -c Release --no-restore -- artifacts/samples
python3 scripts/package.py
dotnet build src/Installer/Installer.csproj -c Release --no-restore
setup_name=StrataDraw-Setup-CorelDRAW2025-x64.exe
cp "src/Installer/bin/Release/net48/$setup_name" "artifacts/$setup_name"
dotnet run --project tests/Check.csproj -c Release --no-build -- --check-installer "artifacts/$setup_name" artifacts/StrataDraw-CorelDRAW2025.zip
