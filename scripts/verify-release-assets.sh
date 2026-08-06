#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
VERSION="${2:-${MOCK_VERSION:-$(tr -d '[:space:]' < ki-buddy-version.txt)}}"
ERRORS=0

for f in latest.yml latest-win-arm64.yml latest-mac.yml latest-arm64-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing canonical metadata: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

extract_ref_file() {
  local metadata_file="$1"
  local ref
  ref=$(grep -E '^path:' "$metadata_file" | head -n 1 | sed -E 's/^path:[[:space:]]*//')
  if [ -z "$ref" ]; then
    ref=$(grep -E '^[[:space:]]*-?[[:space:]]*url:' "$metadata_file" | head -n 1 | sed -E 's/^[[:space:]]*-?[[:space:]]*url:[[:space:]]*//')
  fi
  echo "$ref"
}

assert_metadata_points_to_existing_file() {
  local metadata_name="$1"
  local expected_pattern="$2"
  local metadata_path="$OUTPUT_DIR/$metadata_name"

  local ref_file
  ref_file=$(extract_ref_file "$metadata_path")
  local metadata_version
  metadata_version=$(grep -E '^version:' "$metadata_path" | head -n 1 | sed -E "s/^version:[[:space:]]*['\"]?([^'\"]+).*/\1/")

  if [ "$metadata_version" != "$VERSION" ]; then
    echo "FAIL: $metadata_name version is $metadata_version, expected $VERSION"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [ -z "$ref_file" ]; then
    echo "FAIL: $metadata_name has no path/url entry"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [[ ! "$ref_file" =~ $expected_pattern ]]; then
    echo "FAIL: $metadata_name points to unexpected file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [ ! -f "$OUTPUT_DIR/$ref_file" ]; then
    echo "FAIL: $metadata_name references missing file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  echo "PASS: $metadata_name -> $ref_file"
}

assert_metadata_points_to_existing_file "latest.yml" "(win-x64|win32-x64|x64)"
assert_metadata_points_to_existing_file "latest-mac.yml" "(mac-x64|darwin-x64|x64)"
assert_metadata_points_to_existing_file "latest-linux.yml" "(linux|AppImage|deb)"
assert_metadata_points_to_existing_file "latest-linux-arm64.yml" "(arm64|aarch64)"
assert_metadata_points_to_existing_file "latest-win-arm64.yml" "(arm64|aarch64)"
assert_metadata_points_to_existing_file "latest-arm64-mac.yml" "(arm64|aarch64)"

# Web-CLI tarballs + checksums
for plat in darwin-arm64 darwin-x86_64 linux-arm64 linux-x86_64 win-x86_64; do
  tarball="ki-buddy-web-${VERSION}-${plat}.tar.gz"
  for f in "$tarball" "${tarball}.sha256"; do
    if [ ! -f "$OUTPUT_DIR/$f" ]; then
      echo "FAIL: missing web-cli asset: $f"
      ERRORS=$((ERRORS + 1))
    else
      echo "PASS: $f exists"
    fi
  done
done

if [ ! -f "$OUTPUT_DIR/install-web.sh" ]; then
  echo "FAIL: missing install-web.sh"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: install-web.sh exists"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"
