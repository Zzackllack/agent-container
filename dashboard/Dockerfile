FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.11.2
COPY dashboard/package.json dashboard/pnpm-lock.yaml dashboard/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY dashboard/ ./
RUN pnpm test && pnpm build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3780
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY versions/codex.env versions/opencode.env versions/gh.env ./versions/
RUN mkdir -p /home/agent /var/lib/agent-dashboard \
    && chown node:node /home/agent /var/lib/agent-dashboard
USER node
EXPOSE 3780
CMD ["node", "dist/server/index.js"]
