# ══════════════════════════════════════════════════════════════
# Reminders Mini App — Node.js 20 / Debian slim image
# ══════════════════════════════════════════════════════════════
FROM node:20-bookworm-slim

# tini gives the app proper PID 1 signal handling (clean Ctrl+C / docker stop)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY server.js ./
COPY Web ./Web
COPY Data ./Data

# The official node:20 images already ship a non-root "node" user (uid 1000)
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Persist reminders/settings/users outside the container's writable layer
VOLUME ["/app/Data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
