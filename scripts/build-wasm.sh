#!/usr/bin/env bash
# Builds the core for wasm32-unknown-unknown and generates Node bindings in
# dist/core/geoharness_wasm.js (+ geoharness_wasm_bg.wasm, .d.ts).
#
# Bindings target: `nodejs` — CommonJS with synchronous instantiation from the .wasm
# file next to it. No package.json is written there, so the nearest one must not set
# "type": "module" for dist/core (the host loads it with createRequire on Node 24).
# wasm-bindgen-cli is pinned to the exact wasm-bindgen version in Cargo.lock: a CLI
# that differs from the crate produces bindings that fail at load time.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_dir="${CARGO_TARGET_DIR:-$repo/target}" # cargo's own default when unset
out_dir="$repo/dist/core"

version="$(awk '/^name = "wasm-bindgen"$/ { getline; gsub(/version = |"/, ""); print; exit }' "$repo/Cargo.lock")"
if [[ -z "$version" ]]; then
  echo "build-wasm: wasm-bindgen not found in Cargo.lock" >&2
  exit 1
fi

bindgen="wasm-bindgen"
if [[ "$(wasm-bindgen --version 2>/dev/null || true)" != "wasm-bindgen $version" ]]; then
  tools="$target_dir/tools/wasm-bindgen-$version"
  bindgen="$tools/bin/wasm-bindgen"
  if [[ ! -x "$bindgen" ]]; then
    cargo install wasm-bindgen-cli --version "=$version" --locked --root "$tools"
  fi
fi
if [[ "$("$bindgen" --version)" != "wasm-bindgen $version" ]]; then
  echo "build-wasm: $bindgen is not wasm-bindgen $version" >&2
  exit 1
fi

# dist/core is committed and CI rebuilds it byte for byte, so no machine-specific path may
# reach the binary (panic locations embed source paths): remap every root to a fixed name.
# The toolchain is pinned by rust-toolchain.toml for the same reason.
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
sysroot="$(rustc --print sysroot)"
export RUSTFLAGS="--remap-path-prefix=$cargo_home=/cargo --remap-path-prefix=$sysroot=/rustc --remap-path-prefix=$repo=/geoharness"
cargo build --manifest-path "$repo/Cargo.toml" -p geoharness-wasm --target wasm32-unknown-unknown --release
rm -rf "$out_dir"
"$bindgen" --target nodejs --out-dir "$out_dir" --out-name geoharness_wasm \
  "$target_dir/wasm32-unknown-unknown/release/geoharness_wasm.wasm"
if [[ -e "$out_dir/package.json" ]]; then
  echo "build-wasm: unexpected $out_dir/package.json (bindings must load as CommonJS)" >&2
  exit 1
fi
echo "build-wasm: $(wc -c < "$out_dir/geoharness_wasm_bg.wasm" | tr -d ' ') bytes -> $out_dir/geoharness_wasm.js"
