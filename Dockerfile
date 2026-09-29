FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm test && npm run build

# Site 100 % statique : les données restent dans le navigateur (localStorage).
FROM nginx:1.27-alpine
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
EXPOSE 80
