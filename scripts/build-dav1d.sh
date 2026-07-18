#!/usr/bin/env bash
#
# Build libdav1d from source into a local prefix, for the optional `avif`
# feature (AVIF image decoding via the `image` crate's `avif-native` → the
# `dav1d` C library). AVIF is OFF by default precisely because it needs this C
# dependency; run this only if you want AVIF coverage.
#
# Why from source: the `dav1d` Rust crate requires libdav1d >= 1.3.0, which is
# newer than some LTS distros package (Ubuntu 22.04 ships 0.9.2). This script
# needs no root — it installs to ~/.local/dav1d.
#
# Requirements: a C compiler, `ninja`, and `meson` (pip install --user meson).
# It builds WITHOUT nasm/asm, so no assembler is needed; decode is correct, just
# without SIMD speedups (fine for a headless screenshot path).
#
# Usage:
#   ./scripts/build-dav1d.sh
#   export PKG_CONFIG_PATH="$HOME/.local/dav1d/lib/pkgconfig:$PKG_CONFIG_PATH"
#   cargo build --release --features render,avif
#
set -euo pipefail

DAV1D_VERSION="${DAV1D_VERSION:-1.5.1}"
PREFIX="${DAV1D_PREFIX:-$HOME/.local/dav1d}"
SRC="$(mktemp -d)/dav1d"

echo ">> building libdav1d ${DAV1D_VERSION} -> ${PREFIX}"

for tool in ninja meson git; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "!! missing '$tool'." >&2
    [ "$tool" = meson ] && echo "   install with: pip install --user meson" >&2
    exit 1
  }
done

git clone --depth 1 --branch "$DAV1D_VERSION" \
  https://code.videolan.org/videolan/dav1d.git "$SRC"

meson setup "$SRC/build" "$SRC" \
  --prefix="$PREFIX" --libdir=lib \
  --default-library=static --buildtype=release \
  -Denable_asm=false -Denable_tools=false -Denable_tests=false

ninja -C "$SRC/build"
ninja -C "$SRC/build" install

echo
echo ">> done. libdav1d.a + dav1d.pc installed under ${PREFIX}"
echo ">> next:"
echo "     export PKG_CONFIG_PATH=\"${PREFIX}/lib/pkgconfig:\$PKG_CONFIG_PATH\""
echo "     cargo build --release --features render,avif"
