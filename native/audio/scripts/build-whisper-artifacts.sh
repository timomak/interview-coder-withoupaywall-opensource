#!/bin/bash
set -euo pipefail

if [[ $# -ne 1 || "$1" != /* ]]; then
  echo "usage: build-whisper-artifacts.sh /absolute/output-directory" >&2
  exit 2
fi

output_dir=$1
source_commit=23ee03506a91ac3d3f0071b40e66a430eebdfa1d
source_sha256=c8b0de473e9ec47a74bdf6104425c709261beeada8d6d7c1fec7432be701d032
model_revision=5359861c739e955e79d9a303bcbc70fb988958b1
model_sha256=a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002

test "$(cmake --version | head -n 1)" = "cmake version 4.4.1"
test "$(xcrun clang --version | head -n 1)" = \
  "Apple clang version 21.0.0 (clang-2100.1.1.101)"

mkdir -p "$output_dir"
if [[ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "output directory must be empty" >&2
  exit 2
fi

source_archive="$output_dir/whisper-src.tar.gz"
model_file="$output_dir/ggml-base.en.bin"
curl --fail --silent --show-error --location \
  "https://github.com/ggml-org/whisper.cpp/archive/${source_commit}.tar.gz" \
  --output "$source_archive"
test "$(shasum -a 256 "$source_archive" | awk '{print $1}')" = "$source_sha256"

curl --fail --silent --show-error --location \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/${model_revision}/ggml-base.en.bin" \
  --output "$model_file"
test "$(shasum -a 256 "$model_file" | awk '{print $1}')" = "$model_sha256"

tar -xzf "$source_archive" -C "$output_dir"
source_dir="$output_dir/whisper.cpp-${source_commit}"

for architecture in arm64 x86_64; do
  build_name=$architecture
  [[ "$architecture" == "arm64" ]] && build_name=arm64
  [[ "$architecture" == "x86_64" ]] && build_name=x64
  cmake -S "$source_dir" -B "$output_dir/build-$build_name" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_ARCHITECTURES="$architecture" \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF
  cmake --build "$output_dir/build-$build_name" --target whisper-cli --parallel
done

arm_hash=$(shasum -a 256 "$output_dir/build-arm64/bin/whisper-cli" | awk '{print $1}')
x64_hash=$(shasum -a 256 "$output_dir/build-x64/bin/whisper-cli" | awk '{print $1}')
printf 'WHISPER_ARTIFACT arm64_sha256=%s x64_sha256=%s model_sha256=%s\n' \
  "$arm_hash" "$x64_hash" "$model_sha256"
