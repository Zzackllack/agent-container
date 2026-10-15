#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/maven.env"

# Maven is architecture-independent; it only needs a JDK, which the image
# provides through JAVA_HOME.
download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="apache-maven-${MAVEN_VERSION}-bin.tar.gz"

curl --fail --show-error --location --retry 3 \
    "https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/${archive}" \
    --output "$download_dir/$archive"
printf '%s  %s\n' "$MAVEN_SHA512" "$download_dir/$archive" | sha512sum --check --strict

# /opt matches the other image-managed toolchains; PATH is set in the Dockerfile.
tar -xzf "$download_dir/$archive" -C "$download_dir"
install -d /opt/maven
cp -R "$download_dir/apache-maven-${MAVEN_VERSION}/." /opt/maven/

/opt/maven/bin/mvn --version | grep -F "Apache Maven $MAVEN_VERSION"
