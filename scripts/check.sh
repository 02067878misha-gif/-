#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/activate.sh
dotnet build src/Panel/Panel.csproj -c Release --no-restore
dotnet run --project tests/Check.csproj -c Release --no-restore -- artifacts/samples
python3 scripts/package.py
