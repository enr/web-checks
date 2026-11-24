# shellcheck shell=bash
# Sourced by the .sdlc scripts: project paths and the package manager.
#
#   sdlc_dir, prj_home   this folder and the project root (the cwd after sourcing)
#   pnpm …               pnpm from PATH, or the version pinned in package.json's
#                        packageManager through npx (corepack is not required)

tool_source="${BASH_SOURCE[1]}"
while [ -h "$tool_source" ]; do tool_source="$(readlink "$tool_source")"; done
sdlc_dir="$( cd -P "$( dirname "$tool_source" )" && pwd )"
prj_home="$( cd -P "$( dirname "$sdlc_dir" )" && pwd )"
export sdlc_dir prj_home

cd "${prj_home}" || exit 1

require() {
  local missing=""
  for tool in "$@"; do
    command -v "${tool}" >/dev/null 2>&1 || missing="${missing} ${tool}"
  done
  if [ -n "${missing}" ]; then
    echo >&2 "Missing required tools:${missing}"
    exit 1
  fi
}

require node npx

if command -v pnpm >/dev/null 2>&1; then
  pnpm() { command pnpm "$@"; }
else
  pnpm_spec="$(node -p "require('./package.json').packageManager || 'pnpm'")"
  pnpm() { npx --yes "${pnpm_spec%%+*}" "$@"; }
fi

# The version every release artifact must agree on.
project_version() {
  node -p "require('./package.json').version"
}
