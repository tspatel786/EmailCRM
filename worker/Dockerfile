FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY worker ./worker
RUN npm install --omit=dev --workspace=@crm/shared --workspace=@crm/worker
WORKDIR /app/worker
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
