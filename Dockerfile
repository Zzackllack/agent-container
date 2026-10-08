FROM debian:trixie-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        dnsutils \
        git \
        iproute2 \
        iputils-ping \
        jq \
        less \
        nano \
        openssh-client \
        procps \
        ripgrep \
        sudo \
        unzip \
        xz-utils \
        zip \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
COPY scripts/install-codex.sh versions/codex.env /tmp/codex-install/
RUN sh /tmp/codex-install/install-codex.sh "$TARGETARCH" \
    && rm -rf /tmp/codex-install

COPY scripts/install-opencode.sh versions/opencode.env /tmp/opencode-install/
RUN sh /tmp/opencode-install/install-opencode.sh "$TARGETARCH" \
    && rm -rf /tmp/opencode-install

COPY scripts/install-t3.sh versions/t3.env /tmp/t3-install/
RUN sh /tmp/t3-install/install-t3.sh "$TARGETARCH" \
    && rm -rf /tmp/t3-install

COPY scripts/install-docker.sh versions/docker.env /tmp/docker-install/
RUN sh /tmp/docker-install/install-docker.sh "$TARGETARCH" \
    && rm -rf /tmp/docker-install /var/lib/apt/lists/*

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
        /home/agent/.codex /home/agent/.t3 /home/agent/.docker \
        /home/agent/.config/opencode /home/agent/.local/share/opencode \
        /home/agent/.local/state/opencode /home/agent/.cache/opencode

ENV HOME=/home/agent \
    CODEX_HOME=/home/agent/.codex \
    T3CODE_HOME=/home/agent/.t3 \
    OPENCODE_DISABLE_AUTOUPDATE=true \
    DOCKER_HOST=unix:///var/run/docker.sock \
    WORKSPACE_DOCKER_ENABLED=false

USER agent
WORKDIR /workspace
EXPOSE 3773
ENTRYPOINT ["workspace-entrypoint"]
CMD ["t3", "serve", "--host", "0.0.0.0", "--port", "3773"]
