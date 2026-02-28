#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Error: version argument is required"
  exit 1
fi

version="$1"
echo "Next release version: $version"
echo "$version" > /tmp/pre-release.version
