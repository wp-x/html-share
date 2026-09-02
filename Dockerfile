# ---- 依赖阶段：安装生产依赖（better-sqlite3 在 glibc 平台有预编译产物，无需编译链）----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# postinstall 会执行 scripts/copy-vendor.js（依赖 src/util.js），需提前就位
COPY scripts ./scripts
COPY src/util.js ./src/util.js
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ---- 运行阶段 ----
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# 确保 highlight.js 本地静态资源就位（postinstall 在 deps 阶段未生成时兜底）
RUN node scripts/copy-vendor.js

# 创建非 root 用户；容器以 root 启动，由 entrypoint 修正数据目录属主后降权为 app 运行
# （直接 USER app 会在挂载宿主机新目录时因属主为 root 而无法写入）
RUN groupadd -r app && useradd -r -g app app \
    && mkdir -p /app/data \
    && chown -R app:app /app \
    && chmod +x scripts/entrypoint.sh

VOLUME /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "scripts/entrypoint.sh"]
