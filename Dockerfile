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

# Workspace root is useful for apt and, later, the internal Docker daemon.
# Keep interactive tools under an ordinary user; sudo stays inside the workspace.
RUN useradd --create-home --uid 1000 --shell /bin/bash agent \
    && printf 'agent ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent \
    && install -d -o agent -g agent /workspace /home/agent/.codex

ENV HOME=/home/agent \
    CODEX_HOME=/home/agent/.codex

USER agent
WORKDIR /workspace
CMD ["bash"]
