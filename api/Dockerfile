# --- build stage: install production deps ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# --- runtime stage ---
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# Copy installed deps and source.
COPY --from=build /app/node_modules ./node_modules
COPY . .

# Run as the built-in non-root user.
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
