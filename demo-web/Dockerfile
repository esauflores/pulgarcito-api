FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["pnpm", "start"]
