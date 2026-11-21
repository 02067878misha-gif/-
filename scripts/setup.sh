#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -sm)" != "Linux x86_64" ]]; then
  echo "This setup script requires Linux x86_64." >&2
  exit 1
fi
sdk_dir="$PWD/.env/dotnet"
mkdir -p "$PWD/.env"
if [[ ! -x "$sdk_dir/dotnet" ]]; then
  staging=$(mktemp -d "$PWD/.env/install.XXXXXX")
  trap 'rm -rf -- "$staging"' EXIT
  curl -fsSL --retry 3 https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.404/dotnet-sdk-10.0.404-linux-x64.tar.gz -o "$staging/sdk.tar.gz"
  printf '%s  %s\n' 577d0eb17fec33d029104c5c63a1ab0accc3e28776274abef2218dbac5af18d2109b5406d26b31d76f5c245215e3ba0926a94c20246c672c41847c9e1eb1dc50 "$staging/sdk.tar.gz" | sha512sum -c -
  mkdir "$staging/sdk"
  tar -xzf "$staging/sdk.tar.gz" -C "$staging/sdk"
  mv -T "$staging/sdk" "$sdk_dir"
fi
source scripts/activate.sh
dotnet --version
dotnet restore src/Panel/Panel.csproj --locked-mode --configfile NuGet.Config
dotnet restore tests/Check.csproj --locked-mode --configfile NuGet.Config
