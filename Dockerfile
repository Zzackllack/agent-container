FROM debian:trixie-slim

# Baseline utilities plus the developer tooling agents reach for constantly.
# Everything here comes from the signed Debian 13 repository; the
# checksum-pinned toolchains install further down. The headless browser
# libraries let Playwright/Puppeteer launch Chromium without extra setup, while
# the browsers themselves stay a per-project install.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        bash \
        bat \
        build-essential \
        bzip2 \
        ca-certificates \
        cmake \
        curl \
        direnv \
        dnsutils \
        fd-find \
        fontconfig \
        fonts-dejavu-core \
        fonts-liberation \
        fzf \
        git \
        git-delta \
        git-lfs \
        htop \
        iproute2 \
        iputils-ping \
        jq \
        just \
        less \
        libasound2t64 \
        libatk-bridge2.0-0t64 \
        libatk1.0-0t64 \
        libcairo2 \
        libcups2t64 \
        libdrm2 \
        libgbm1 \
        libnss3 \
        libpango-1.0-0 \
        libssl-dev \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        nano \
        openssh-client \
        openssl \
        pkg-config \
        postgresql-client \
        procps \
        protobuf-compiler \
        python3 \
        python3-dev \
        python3-venv \
        ripgrep \
        rsync \
        shellcheck \
        sqlite3 \
        sudo \
        tmux \
        tree \
        unzip \
        wget \
        xvfb \
        xz-utils \
        zip \
        zoxide \
        zstd \
    && rm -rf /var/lib/apt/lists/*

# Debian ships fd as fdfind and bat as batcat; agents expect the upstream names.
RUN ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && ln -s /usr/bin/batcat /usr/local/bin/bat

# Java uses the Debian OpenJDK 25 package: trixie ships the same upstream release
# as current Temurin, so no third-party archive is needed. /opt/java is a stable
# JAVA_HOME symlink that does not name the architecture. Roughly 0.4 GB together
# with Maven; --build-arg WITH_JAVA=0 leaves both out.
ARG WITH_JAVA=1
RUN if [ "$WITH_JAVA" = 1 ]; then \
        apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openjdk-25-jdk \
        && rm -rf /var/lib/apt/lists/* \
        && ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")" /opt/java; \
    fi

COPY scripts/install-maven.sh versions/maven.env /tmp/maven-install/
# Maven is useless without a JDK, so it shares the WITH_JAVA flag.
RUN if [ "$WITH_JAVA" = 1 ]; then \
        sh /tmp/maven-install/install-maven.sh; \
    fi \
    && rm -rf /tmp/maven-install

ARG TARGETARCH
COPY scripts/install-codex.sh versions/codex.env /tmp/codex-install/
RUN sh /tmp/codex-install/install-codex.sh "$TARGETARCH" \
    && rm -rf /tmp/codex-install

COPY scripts/install-opencode.sh versions/opencode.env /tmp/opencode-install/
RUN sh /tmp/opencode-install/install-opencode.sh "$TARGETARCH" \
    && rm -rf /tmp/opencode-install

COPY scripts/install-docker.sh versions/docker.env /tmp/docker-install/
RUN sh /tmp/docker-install/install-docker.sh "$TARGETARCH" \
    && rm -rf /tmp/docker-install /var/lib/apt/lists/*

COPY scripts/install-gh.sh versions/gh.env /tmp/gh-install/
RUN sh /tmp/gh-install/install-gh.sh "$TARGETARCH" \
    && rm -rf /tmp/gh-install

COPY scripts/install-node.sh versions/node.env /tmp/node-install/
RUN sh /tmp/node-install/install-node.sh "$TARGETARCH" \
    && rm -rf /tmp/node-install

COPY scripts/install-uv.sh versions/uv.env /tmp/uv-install/
RUN sh /tmp/uv-install/install-uv.sh "$TARGETARCH" \
    && rm -rf /tmp/uv-install

COPY scripts/install-go.sh versions/go.env /tmp/go-install/
# Go and Rust are the two heaviest additions (~0.3 GB and ~0.6 GB installed) and
# are on by default. Build with --build-arg WITH_GO=0 --build-arg WITH_RUST=0
# for a smaller workspace image; every other tool stays.
ARG WITH_GO=1
RUN if [ "$WITH_GO" = 1 ]; then \
        sh /tmp/go-install/install-go.sh "$TARGETARCH"; \
    fi \
    && rm -rf /tmp/go-install

COPY scripts/install-rust.sh versions/rust.env /tmp/rust-install/
ARG WITH_RUST=1
RUN if [ "$WITH_RUST" = 1 ]; then \
        sh /tmp/rust-install/install-rust.sh "$TARGETARCH"; \
    fi \
    && rm -rf /tmp/rust-install

COPY scripts/install-t3.sh /tmp/t3-install/
# Change this build arg to refresh the nightly lookup without rebuilding tools.
ARG T3_REFRESH=latest
RUN sh /tmp/t3-install/install-t3.sh "$TARGETARCH" \
    && rm -rf /tmp/t3-install

COPY --chmod=0755 scripts/agent-cli.sh /usr/local/lib/agent-container/agent-cli
# Replace only the installer-created links; preserve both native executables.
RUN rm /usr/local/bin/codex /usr/local/bin/opencode \
    && ln -s /usr/local/lib/agent-container/agent-cli /usr/local/bin/codex \
    && ln -s /usr/local/lib/agent-container/agent-cli /usr/local/bin/opencode
COPY --chmod=0755 scripts/context7-setup.sh /usr/local/bin/context7-setup
COPY --chmod=0755 scripts/t3-runtime.sh /usr/local/lib/agent-container/t3-runtime
RUN ln -s /usr/local/lib/agent-container/t3-runtime /usr/local/bin/t3 \
    && ln -s /usr/local/lib/agent-container/t3-runtime /usr/local/bin/workspace-t3

COPY config/docker-daemon.json /etc/docker/daemon.json
COPY --chmod=0755 scripts/t3-pair.sh /usr/local/bin/t3-pair
COPY --chmod=0755 scripts/workspace-entrypoint.sh /usr/local/bin/workspace-entrypoint
COPY --chmod=0755 scripts/workspace-healthcheck.sh /usr/local/bin/workspace-healthcheck

# Workspace root is useful for apt and the internal Docker daemon.
# Keep interactive tools under an ordinary user; sudo stays inside the workspace.
RUN useradd --create-home --uid 1000 --shell /bin/bash agent \
    && printf 'agent ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent \
    && install -d -o agent -g agent /workspace \
        /home/agent/.config \
        /home/agent/.local /home/agent/.local/share /home/agent/.local/state \
        /home/agent/.cache \
        /home/agent/.codex /home/agent/.t3 /home/agent/.docker \
        /home/agent/.config/opencode /home/agent/.local/share/opencode \
        /home/agent/.local/state/opencode /home/agent/.cache/opencode

ENV HOME=/home/agent \
    CODEX_HOME=/home/agent/.codex \
    T3CODE_HOME=/home/agent/.t3 \
    T3CODE_HOST=0.0.0.0 \
    T3CODE_PORT=3773 \
    T3CODE_NO_BROWSER=true \
    OPENCODE_DISABLE_AUTOUPDATE=true \
    DOCKER_HOST=unix:///var/run/docker.sock \
    WORKSPACE_DOCKER_ENABLED=false \
    RUSTUP_HOME=/opt/rustup \
    JAVA_HOME=/opt/java \
    PATH=/opt/java/bin:/opt/maven/bin:/opt/node/bin:/usr/local/go/bin:/opt/cargo/bin:$PATH

USER agent
WORKDIR /workspace
EXPOSE 3773
ENTRYPOINT ["workspace-entrypoint"]
CMD ["workspace-t3"]
