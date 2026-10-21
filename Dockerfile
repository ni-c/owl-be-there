# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Owl Be There: the API with the built client inside it, one SQLite file on a
# volume.
#
# The two build stages run on the build machine's own architecture
# (`--platform=$BUILDPLATFORM`): what they produce is JavaScript, CSS and the
# production dependencies — fastify, its two plugins and zod in plain
# JavaScript; resvg and wawoff2, which draw the link-preview pictures, in
# WebAssembly; and the Nunito font files — so it runs unchanged on amd64 and
# arm64. Never add a native module: it would be built for one of the two. Neither
# WebAssembly module may be fed anything but the server's own SVG and the bundled
# fonts (wawoff2 is unmaintained, resvg-wasm embeds old crates). Only the runtime stage
# is per architecture, and it compiles nothing; a multi-arch build therefore
# needs no emulation except for one `apk upgrade`.

# Every stage names the base image literally, pinned by digest to the
# multi-arch index, so Dependabot's docker ecosystem finds and moves all three
# lines in one pull request (an ARG hides the reference from it). Node 26
# becomes the active LTS line on 2026-10-28. Currently Node v26.12.0.

# --------------------------------------------------------------------- build
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
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
# Run by the client build: writes the .br and .gz copies.
COPY scripts/precompress.ts scripts/precompress.ts
# Shared, then server, then client; the order is in the script. The client
# build emits no source maps (a publicly fetchable copy of the sources).
RUN npm run build \
  && mkdir /data-template

# ---------------------------------------------------------- production deps
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
# The server's runtime dependencies and nothing else: the client is shipped
# built, so React and Vite stay out of the image.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace @owl/server

# ------------------------------------------------------------------- runtime
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS runtime

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
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/fonts packages/server/fonts
COPY --from=build /app/packages/client/dist packages/client/dist
# The only writable place: the database and the server secret. Everything else
# stays root-owned, and the container runs with a read-only root filesystem.
COPY --from=build --chown=node:node /data-template /data

# Numeric, so Kubernetes `runAsNonRoot` can verify it: the node user.
USER 1000:1000
VOLUME ["/data"]
EXPOSE 8080

# Node's own fetch, so the image needs neither curl nor wget. A blank PORT
# means 8080, exactly as the server reads it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${(process.env.PORT || '').trim() || 8080}/api/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form: node is PID 1 and receives SIGTERM itself, closing the server and
# checkpointing the database before it exits.
CMD ["node", "packages/server/dist/index.js"]
