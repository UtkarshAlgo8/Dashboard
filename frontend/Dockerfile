FROM node:20-slim AS build
WORKDIR /app

# Copy only dependency files first
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Backend the bundle talks to. Vite inlines this at BUILD time, so it cannot be
# changed by a run-time -e flag — the test stack must pass it as --build-arg.
ARG VITE_API_BASE_URL

# Written to .env.production.local rather than relied on as a process env var:
# that file has the highest precedence of any Vite env source, so it beats the
# committed .env (which pins the production API) with no ambiguity.
RUN if [ -n "$VITE_API_BASE_URL" ]; then \
      echo "VITE_API_BASE_URL=$VITE_API_BASE_URL" > .env.production.local; \
    fi

# Build the project
RUN npm run build

# Serve using NGINX
FROM nginx:alpine

# Listen port, substituted into the template at container start. Defaults to
# the production value; the test stack overrides with -e NGINX_PORT=3015.
ARG NGINX_PORT=3014
ENV NGINX_PORT=${NGINX_PORT}

# templates/ (not conf.d/) so the image entrypoint runs envsubst over it.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE ${NGINX_PORT}
CMD ["nginx", "-g", "daemon off;"]
