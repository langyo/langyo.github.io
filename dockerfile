FROM ghcr.io/getzola/zola:v0.21.0 AS zola

COPY . /home
WORKDIR /home
RUN ["zola", "build"]

FROM ghcr.io/static-web-server/static-web-server:2
WORKDIR /
COPY --from=zola /home/public /public
