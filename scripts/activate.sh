# Run with "source scripts/activate.sh" in Bash.
project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export DOTNET_ROOT="$project_dir/.env/dotnet"
export PATH="$DOTNET_ROOT:$PATH"
export DOTNET_CLI_HOME="$project_dir/.env/cli"
export NUGET_PACKAGES="$project_dir/.env/packages"
export DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1
export XDG_DATA_HOME="$project_dir/.env/data"
export TMPDIR="$project_dir/.env/tmp"
mkdir -p "$XDG_DATA_HOME" "$TMPDIR"
export XDG_RUNTIME_DIR="$project_dir/.env/runtime"
mkdir -p -m 700 "$XDG_RUNTIME_DIR"
