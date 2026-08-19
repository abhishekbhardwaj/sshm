#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

check_git_repo() {
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    log_error "Not in a git repository"
    exit 1
  fi
}

check_clean_working_dir() {
  if [ -n "$(git status --porcelain)" ]; then
    log_error "Working directory is not clean. Please commit or stash changes."
    git status --short
    exit 1
  fi
}

get_current_version() {
  bun -e 'console.log(require(process.argv[1]).version)' "$PROJECT_DIR/package.json"
}

bump_version() {
  local bump_type=$1
  local current_version
  current_version=$(get_current_version)
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current_version"

  case "$bump_type" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *)
      log_error "Invalid bump type: $bump_type. Use major, minor, or patch."
      exit 1
      ;;
  esac

  local new_version="$major.$minor.$patch"
  bun -e '
    const path = process.argv[1];
    const packageJson = require(path);
    packageJson.version = process.argv[2];
    await Bun.write(path, `${JSON.stringify(packageJson, null, 2)}\n`);
  ' "$PROJECT_DIR/package.json" "$new_version"
  echo "$new_version"
}

create_git_tag() {
  local version=$1
  local tag="v$version"
  cd "$PROJECT_DIR"

  log_info "Creating git commit and tag..."
  git add package.json >/dev/null 2>&1
  git commit -m "chore: bump version to $version" >/dev/null 2>&1
  git tag -a "$tag" -m "Release $tag" >/dev/null 2>&1
  log_success "Created tag $tag"
  echo "$tag"
}

push_to_remote() {
  local tag=$1
  log_info "Pushing to remote..."
  git push origin main
  git push origin "$tag"
  log_success "Pushed to remote"
}

show_usage() {
  cat <<EOF
sshm Release Script

Usage: $0 [OPTIONS] <bump_type>

Bump types:
  major    Increment major version (1.0.0 -> 2.0.0)
  minor    Increment minor version (1.0.0 -> 1.1.0)
  patch    Increment patch version (1.0.0 -> 1.0.1)

Options:
  --dry-run    Show what would be done without making changes
  --no-push    Don't push to remote repository
  --help, -h   Show this help message
EOF
}

main() {
  local bump_type=""
  local dry_run=false
  local no_push=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --dry-run) dry_run=true; shift ;;
      --no-push) no_push=true; shift ;;
      --help|-h) show_usage; exit 0 ;;
      major|minor|patch) bump_type=$1; shift ;;
      *)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
    esac
  done

  if [ -z "$bump_type" ]; then
    log_error "Bump type is required"
    show_usage
    exit 1
  fi

  echo "🚀 sshm Release Process"
  echo "========================"
  if [ "$dry_run" = true ]; then
    log_warning "DRY RUN MODE - No changes will be made"
  fi

  check_git_repo
  check_clean_working_dir

  local current_version
  current_version=$(get_current_version)
  log_info "Current version: $current_version"
  log_info "Bump type: $bump_type"

  if [ "$dry_run" = true ]; then
    log_info "Would bump version to next $bump_type version"
    log_info "Would create git tag and push to remote"
    log_info "GitHub Actions would then build and release binaries"
    exit 0
  fi

  read -rp "Continue with release? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Release cancelled"
    exit 0
  fi

  log_info "Bumping version..."
  local new_version
  new_version=$(bump_version "$bump_type")
  log_info "New version: $new_version"

  local tag
  tag=$(create_git_tag "$new_version")
  if [ "$no_push" = false ]; then
    push_to_remote "$tag"
    log_info "GitHub Actions will automatically create the release"
  else
    log_warning "Skipped pushing to remote (--no-push)"
    log_info "To complete the release, run: git push origin main && git push origin $tag"
  fi

  log_success "Release $tag completed!"
}

check_dependencies() {
  local missing_deps=()
  command -v bun >/dev/null 2>&1 || missing_deps+=("bun")
  command -v git >/dev/null 2>&1 || missing_deps+=("git")
  if [ ${#missing_deps[@]} -gt 0 ]; then
    log_error "Missing dependencies: ${missing_deps[*]}"
    exit 1
  fi
}

check_dependencies
main "$@"
