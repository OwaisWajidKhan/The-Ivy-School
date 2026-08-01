FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=5000
ENV DB_FILE=/app/data/school.db

EXPOSE 5000

# Seed on first boot if DB does not exist yet, then start
CMD ["sh", "-c", "if [ ! -f /app/data/school.db ]; then node src/db/seed.js; fi; node src/index.js"]
