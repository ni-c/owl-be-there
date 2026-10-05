# syntax=docker/dockerfile:1

# Owl Be There: the API with the built client inside it, one SQLite file on a
# volume.
#
# The two build stages run on the build machine's own architecture
# (`--platform=$BUILDPLATFORM`): what they produce is JavaScript, CSS and the
# production dependencies — fastify, its two plugins and zod in plain
# JavaScript; resvg and wawoff2, which draw the link-preview pictures, in
# WebAssembly; and the Nunito font files — so it runs unchanged on amd64 and
# arm64. Never add a native module: it would be built for one of the two. Only the runtime stage
# is per architecture, and it compiles nothing; a multi-arch build therefore
# needs no emulation except for one `apk upgrade`.

# Pinned by digest to the multi-arch index; Dependabot moves it within the
# major. Node 26 becomes the active LTS line on 2026-10-28.
ARG NODE_IMAGE=node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80

# --------------------------------------------------------------------- build
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app

# The manifests alone first, so editing a source file does not re-run the
# install. All three are needed: `npm ci` checks the lockfile against every
# workspace the root manifest declares.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
# `--ignore-scripts`: no package in the tree needs an install hook, and the
# root `prepare` only points git at .githooks — there is no git here.
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/client packages/client
# Shared, then server, then client; the order is in the script. Source maps
# would be a publicly fetchable copy of the sources, so none are kept.
RUN npm run build \
  && rm -f packages/client/dist/assets/*.map \
  && mkdir /data-template

# ---------------------------------------------------------- production deps
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
# The server's runtime dependencies and nothing else: the client is shipped
# built, so React and Vite stay out of the image.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace @owl/server

# ------------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime

# Expires the layer below once a day, so a security fix in the Alpine base
# reaches the image without waiting for a new base digest. CI passes the date.
ARG APK_SECURITY_EPOCH=unset
# npm, npx, corepack and yarn are not needed to run the server, and they are
# where most of the CVEs in a stock Node image live.
RUN echo "apk security epoch: ${APK_SECURITY_EPOCH}" \
  && apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Defaults that are right inside a container. HOST: the server listens on
# loopback by default, which in a container means "reachable from nothing".
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    CLIENT_DIR=/app/packages/client/dist

WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
# The only writable place: the database and the server secret. Everything else
# stays root-owned, and the container runs with a read-only root filesystem.
COPY --from=build --chown=node:node /data-template /data

USER node
VOLUME ["/data"]
EXPOSE 8080

# Node's own fetch, so the image needs neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form: node is PID 1 and receives SIGTERM itself, closing the server and
# checkpointing the database before it exits.
CMD ["node", "packages/server/dist/index.js"]
