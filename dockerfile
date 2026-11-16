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
# Cloudflare honours the origin cache-control; the upstream 1-year default would
# pin stale CSS/JS after every deploy, so cap it at five minutes.
ENV SERVER_CACHE_CONTROL="public, max-age=300"
COPY --from=zola /home/public /public