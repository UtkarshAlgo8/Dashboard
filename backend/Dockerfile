# Stage 1: Build the React app
FROM node:18 as build
 
WORKDIR /app
 
COPY package*.json ./
RUN npm install
 
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
 
# Stage 2: Serve the built files with nginx
FROM nginx:alpine
 
# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
 
COPY --from=build /app/dist /usr/share/nginx/html
 
EXPOSE 8814
 
CMD ["nginx", "-g", "daemon off;"]