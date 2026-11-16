FROM ghcr.io/getzola/zola:v0.21.0 AS zola

# Canonical origin of the deployed site. Override for a mirror build, e.g.
#   docker build --build-arg SITE_BASE_URL=https://langyo.github.io .
# The default matches config.toml's base_url so production stays canonical.
ARG SITE_BASE_URL=https://langyo.xyz

COPY . /home
WORKDIR /home
RUN zola build --base-url "$SITE_BASE_URL"

FROM ghcr.io/static-web-server/static-web-server:2
WORKDIR /
# static-web-server's default cache-control headers pin assets for a year, which
# made Cloudflare serve the previous deploy's CSS/JS forever. Turn that feature
# off: the templates already append a per-build `?v=` to the entry assets.
ENV SERVER_CACHE_CONTROL_HEADERS=false
COPY --from=zola /home/public /public