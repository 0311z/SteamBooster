FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node src/ ./src/
COPY --chown=node:node utils/ ./utils/
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node config/accounts.example.json config/settings.example.json ./config/
RUN mkdir -p data accounts_data logs messages && chown -R node:node /app
USER node
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "const l=require('./utils/singleInstance');const s=l.readLock();process.exit(s&&l.isAlive(s.pid)?0:1)"
ENTRYPOINT ["node", "src/accountHandler.js"]
CMD ["--auto"]
