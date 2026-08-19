#!/usr/bin/env bash
set -euo pipefail

APP=sshm
REPOSITORY=abhishekbhardwaj/sshm
requested_version=${VERSION:-}

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)

case "$arch" in
  aarch64|arm64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
esac

filename="$APP-$os-$arch.tar.gz"
case "$filename" in
  *"-linux-"*|*"-darwin-"*)
    [[ "$arch" == "x64" || "$arch" == "arm64" ]] || { echo "Unsupported OS/Arch: $os/$arch" >&2; exit 1; }
    ;;
  *)
    echo "Unsupported OS/Arch: $os/$arch" >&2
    exit 1
    ;;
esac

install_dir="$HOME/.local/bin"
mkdir -p "$install_dir"

if [ -z "$requested_version" ]; then
  url="https://github.com/$REPOSITORY/releases/latest/download/$filename"
  version=$(curl -fsSL "https://api.github.com/repos/$REPOSITORY/releases/latest" | awk -F'"' '/"tag_name": "/ {gsub(/^v/, "", $4); print $4}')
else
  url="https://github.com/$REPOSITORY/releases/download/v${requested_version}/$filename"
  version=$requested_version
fi

if [ -z "$version" ]; then
  echo "Could not determine the release version." >&2
  exit 1
fi

if command -v sshm >/dev/null 2>&1 && [ "$(sshm --version 2>/dev/null || true)" = "$version" ]; then
  echo "sshm $version is already installed."
  exit 0
fi

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT
printf 'Downloading sshm %s...\n' "$version"
curl -fL "$url" -o "$temp_dir/$filename"
tar -xzf "$temp_dir/$filename" -C "$temp_dir"
mv "$temp_dir/$APP-$os-$arch" "$install_dir/$APP"
chmod +x "$install_dir/$APP"

if [[ ":$PATH:" != *":$install_dir:"* ]]; then
  echo "Installed to $install_dir/$APP. Add $install_dir to PATH, then open a new shell."
else
  echo "Installed sshm $version to $install_dir/$APP."
fi
