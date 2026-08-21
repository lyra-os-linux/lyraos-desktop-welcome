#!/usr/bin/env bash
# Build the reproducible sources consumed by the lyra-welcome OBS package.
#
# Mirrors upgrade/packaging/make-obs-sources.sh, with two differences that
# follow from how each package is laid out: welcome/ carries its own LICENSE
# and README, so nothing is pulled from the repository root, and its crate
# lives in src-tauri/, so the vendor layer and its relative Cargo configuration
# are rooted there rather than at the archive root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
WELCOME_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$WELCOME_DIR")"
OUTPUT_DIR="${1:-$SCRIPT_DIR/output}"

for command in cargo git sed sha256sum tar zstd; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "required command not found: $command" >&2
    exit 1
  fi
done

if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal)" ]; then
  echo "OBS sources require a clean committed working tree" >&2
  exit 1
fi

VERSION="$(awk -F '"' '/^version = / { print $2; exit }' "$WELCOME_DIR/src-tauri/Cargo.toml")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "could not read the lyra-welcome semantic version" >&2
  exit 1
fi

COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SOURCE_EPOCH="$(git -C "$REPO_ROOT" show -s --format=%ct "$COMMIT")"
PREFIX="lyra-welcome-$VERSION"
TEMPORARY="$(mktemp -d /tmp/lyra-welcome-source.XXXXXX)"

cleanup() {
  case "$TEMPORARY" in
    /tmp/lyra-welcome-source.*) rm -rf -- "$TEMPORARY" ;;
    *) echo "refusing to remove unexpected temporary path: $TEMPORARY" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR" "$TEMPORARY/source/$PREFIX" "$TEMPORARY/vendor-layer/src-tauri/.cargo"
git -C "$REPO_ROOT" archive --format=tar "$COMMIT:welcome" |
  tar -xf - -C "$TEMPORARY/source/$PREFIX"

make_archive() {
  local source_dir="$1"
  local member="$2"
  local destination="$3"
  local temporary_archive="$destination.new"
  rm -f -- "$temporary_archive"
  tar \
    --sort=name \
    --mtime="@$SOURCE_EPOCH" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    --pax-option=delete=atime,delete=ctime \
    -C "$source_dir" \
    -cf - "$member" |
    # Level 15 remains compact while avoiding the memory/time spike of -19
    # on the large Tauri vendor tree. One thread keeps output reproducible.
    zstd --quiet --threads=1 -15 -o "$temporary_archive"
  mv -f -- "$temporary_archive" "$destination"
}

SOURCE_ARCHIVE="$OUTPUT_DIR/$PREFIX.tar.zst"
make_archive "$TEMPORARY/source" "$PREFIX" "$SOURCE_ARCHIVE"

(
  cd "$TEMPORARY/source/$PREFIX/src-tauri"
  cargo vendor --locked "$TEMPORARY/vendor-layer/src-tauri/vendor" \
    >"$TEMPORARY/vendor-layer/src-tauri/.cargo/config.toml"
)
# cargo vendor prints the absolute destination it received. Keep the archive
# independent of the random temporary directory used for this run.
sed -i 's|^directory = .*|directory = "vendor"|' \
  "$TEMPORARY/vendor-layer/src-tauri/.cargo/config.toml"
VENDOR_ARCHIVE="$OUTPUT_DIR/vendor.tar.zst"
make_archive "$TEMPORARY/vendor-layer" src-tauri "$VENDOR_ARCHIVE"

sha256sum "$SOURCE_ARCHIVE" "$VENDOR_ARCHIVE" >"$OUTPUT_DIR/SHA256SUMS.new"
mv -f -- "$OUTPUT_DIR/SHA256SUMS.new" "$OUTPUT_DIR/SHA256SUMS"

printf '%s\n' "$SOURCE_ARCHIVE" "$VENDOR_ARCHIVE" "$OUTPUT_DIR/SHA256SUMS"
