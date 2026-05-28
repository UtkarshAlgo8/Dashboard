FROM node:20-slim AS build
WORKDIR /app
 
# Copy only dependency files first
COPY package.json package-lock.json ./
 
# Install dependencies
RUN npm install
 
# Copy all project files
COPY . .
 
# Build the project
RUN npm run build
 
# Serve using NGINX
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
 
EXPOSE 8814
CMD ["nginx", "-g", "daemon off;"]