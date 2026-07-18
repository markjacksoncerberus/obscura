FROM rust:1-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        perl \
        make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Optional Cargo features for the build, e.g. `--build-arg FEATURES=render` to
# compile in the Blitz-backed renderer (screenshots + real layout geometry).
# Empty by default keeps the image lean (no Stylo/Parley/vello_cpu).
ARG FEATURES=""

# Cache dependency compilation by copying manifests first
COPY Cargo.toml Cargo.lock ./
COPY crates/obscura-dom/Cargo.toml       crates/obscura-dom/Cargo.toml
COPY crates/obscura-net/Cargo.toml       crates/obscura-net/Cargo.toml
COPY crates/obscura-browser/Cargo.toml   crates/obscura-browser/Cargo.toml
COPY crates/obscura-cdp/Cargo.toml       crates/obscura-cdp/Cargo.toml
COPY crates/obscura-js/Cargo.toml        crates/obscura-js/Cargo.toml
COPY crates/obscura-mcp/Cargo.toml       crates/obscura-mcp/Cargo.toml
COPY crates/obscura-render/Cargo.toml    crates/obscura-render/Cargo.toml
COPY crates/obscura-cli/Cargo.toml       crates/obscura-cli/Cargo.toml

# Create stub src files so cargo can resolve the dependency graph
RUN for crate in obscura-dom obscura-net obscura-browser obscura-cdp obscura-js obscura-mcp obscura-render; do \
        mkdir -p crates/$crate/src && echo "// stub" > crates/$crate/src/lib.rs; \
    done && \
    mkdir -p crates/obscura-cli/src && \
    echo "fn main() {}" > crates/obscura-cli/src/main.rs && \
    echo "fn main() {}" > crates/obscura-cli/src/worker.rs

RUN cargo build --release --bin obscura --bin obscura-worker ${FEATURES:+--features "$FEATURES"} 2>/dev/null || true

# Copy real sources (including assets/ — the renderer embeds a bundled font via
# include_bytes!, so it must be present at compile time) and build
COPY assets/ assets/
COPY crates/ crates/
RUN touch crates/*/src/*.rs && \
    cargo build --release --bin obscura --bin obscura-worker ${FEATURES:+--features "$FEATURES"}

# ---

# distroless/cc: glibc + libgcc + CA certs only — no shell, no package manager
FROM gcr.io/distroless/cc-debian12

COPY --from=builder /build/target/release/obscura /obscura
COPY --from=builder /build/target/release/obscura-worker /obscura-worker

EXPOSE 9222

# Bind to 0.0.0.0 so the port is reachable via `docker run -p 9222:9222`.
# Native binary still defaults to 127.0.0.1 (loopback only) — this override
# is just for the container.
ENTRYPOINT ["/obscura"]
CMD ["serve", "--port", "9222", "--host", "0.0.0.0"]
