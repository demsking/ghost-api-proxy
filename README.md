# Ghost API Proxy

A lightweight Bun-based proxy server for the Ghost Admin API that handles authentication and adds necessary headers for publishing posts. Designed to work behind reverse proxies like Traefik with authentication forward middleware (Authelia, TinyAuth, etc.).

## Features

- **Ghost Admin API Integration**: Seamless proxy to Ghost's Admin API
- **JWT Authentication**: Automatic JWT token generation for Ghost API
- **Header Management**: Automatically adds required Ghost headers (Authorization, Accept-Version)
- **Docker Ready**: Containerized with Bun for optimal performance
- **Health Checks**: Built-in health check endpoint
- **Traefik Compatible**: Ready to use with Traefik and auth forward middleware
- **Environment Based**: Fully configurable through environment variables

## Quick Start

```bash
docker run -d --name ghost-proxy -p 3000:3000 --env-file .env demsking/ghost-api-proxy
```

## API Endpoints

The proxy forwards all Ghost Admin API endpoints. Some common ones:

### Posts
- `GET /ghost/api/admin/posts` - List all posts
- `POST /ghost/api/admin/posts` - Create a new post
- `GET /ghost/api/admin/posts/{id}` - Get a specific post
- `PUT /ghost/api/admin/posts/{id}` - Update a post
- `DELETE /ghost/api/admin/posts/{id}` - Delete a post

### Pages
- `GET /ghost/api/admin/pages` - List all pages
- `POST /ghost/api/admin/pages` - Create a new page
- `PUT /ghost/api/admin/pages/{id}` - Update a page
- `DELETE /ghost/api/admin/pages/{id}` - Delete a page

### Users
- `GET /ghost/api/admin/users` - List all users
- `GET /ghost/api/admin/users/me` - Get current user info

### Media
- `POST /ghost/api/admin/images/upload` - Upload images
- `POST /ghost/api/admin/media/upload` - Upload media files

### Site
- `GET /ghost/api/admin/site` - Get site information
- `GET /ghost/api/admin/config` - Get configuration

### Health Check
- `GET /health` - Proxy health check

All endpoints require authentication through your configured auth middleware.

## Ghost Admin Key Setup

1. Go to your Ghost Admin panel
2. Navigate to **Settings** > **Integrations**
3. Click **Add custom integration**
4. Give it a name (e.g., "API Proxy")
5. Copy the **Admin API Key** (format: `id:secret`)
6. Use this as your `GHOST_ADMIN_KEY` environment variable

## Complete Traefik Setup with Ghost and TinyAuth

Here's a complete example showing Ghost CMS, the API proxy, and TinyAuth authentication:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: ghost
    volumes:
      - mysql_data:/var/lib/mysql

  ghost:
    image: ghost:5.130.1-alpine
    restart: unless-stopped
    depends_on:
      - mysql
    volumes:
      - ghost_data:/var/lib/ghost/content
    environment:
      TZ: $TIMEZONE
      url: https://blog.example.com
      database__client: mysql
      database__connection__host: mysql
      database__connection__user: root
      database__connection__password: password
      database__connection__database: ghost
    labels:
      traefik.enable: true
      # Website
      traefik.http.routers.ghost.service: ghost
      traefik.http.routers.ghost.rule: Host(`blog.example.com`)
      traefik.http.routers.ghost.entryPoints: websecure
      traefik.http.routers.ghost.tls.certresolver: letsencrypt
      traefik.http.services.ghost.loadbalancer.server.port: 2368
  
  ghost-proxy:
    image: demsking/ghost-api-proxy:latest
    restart: unless-stopped
    environment:
      GHOST_URL: https://blog.example.com
      GHOST_ADMIN_KEY: ${GHOST_API_TOKEN}
      GHOST_API_VERSION: ${GHOST_API_VERSION:-v5.0}
      PORT: 3000
    healthcheck:
      test: ["CMD", "bun", "run", "-e", "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    labels:
      traefik.enable: true
      traefik.http.routers.ghost-api-proxy.rule: Host(`api.example.com`)
      traefik.http.routers.ghost-api-proxy.entryPoints: websecure
      traefik.http.routers.ghost-api-proxy.tls.certresolver: letsencrypt
      traefik.http.routers.ghost-api-proxy.middlewares: tinyauth
      traefik.http.routers.ghost-api-proxy.service: ghost-api-proxy
      traefik.http.services.ghost-api-proxy.loadbalancer.server.port: 3000
      
  tinyauth:
    image: ghcr.io/steveiliop56/tinyauth:v3.6.0
    restart: unless-stopped
    environment:
      # Configure TinyAuth according to their documentation
      TINYAUTH_SECRET: ${TINYAUTH_SECRET}
      TINYAUTH_DOMAIN: ${DOMAIN}
    labels:
      traefik.enable: true

      # TinyAuth Service
      traefik.http.services.tinyauth.loadbalancer.server.port: 3000

      # TinyAuth Router
      traefik.http.routers.tinyauth.rule: Host(`idp.${DOMAIN}`)
      traefik.http.routers.tinyauth.entryPoints: websecure
      traefik.http.routers.tinyauth.middlewares: security-headers@file
      traefik.http.routers.tinyauth.tls.certresolver: letsencrypt
      traefik.http.routers.tinyauth.service: tinyauth

      # TinyAuth Forward Auth Middleware
      traefik.http.middlewares.tinyauth.forwardauth.address: http://tinyauth:3000/api/auth/traefik
      traefik.http.middlewares.tinyauth.forwardauth.authResponseHeaders: Remote-User,Remote-Groups,Remote-Name,Remote-Email

volumes:
  ghost_data:
  mysql_data:

networks:
  default:
    name: traefik_proxy
    external: true
```

### Environment Variables (.env)

```bash
# Domain configuration
DOMAIN=example.com
TIMEZONE=Europe/Paris

# Ghost API configuration
GHOST_API_TOKEN=your_integration_id:your_integration_secret
GHOST_API_VERSION=v5.0

# TinyAuth configuration
TINYAUTH_SECRET=your_secret_key_here
```

### Alternative Auth Providers

For **Authelia**:
```yaml
traefik.http.routers.ghost-api-proxy.middlewares: authelia@docker
```

For **Authentik**:
```yaml
traefik.http.routers.ghost-api-proxy.middlewares: authentik@docker
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GHOST_URL` | Your Ghost site URL (no trailing slash) | Yes | - |
| `GHOST_ADMIN_KEY` | Ghost Admin API Key (id:secret format) | Yes | - |
| `GHOST_API_VERSION` | Ghost API version to use | No | `v5.0` |
| `PORT` | Port to run the server on | No | `3000` |

## Development

```bash
# Install dependencies
bun install

# Run in development mode with auto-reload
bun run dev

# Build for production
bun run build

# Clean build artifacts
bun run clean
```

## Security Notes

- The proxy does not handle authentication itself - it relies on upstream auth middleware
- JWT tokens are automatically generated and have a 5-minute expiry
- All Ghost API interactions use secure HTTPS connections
- The Docker container runs as a non-root user

## Troubleshooting

### Invalid Admin Key Error
Ensure your `GHOST_ADMIN_KEY` is in the correct format: `id:secret`

### Connection Refused
Check that your `GHOST_URL` is correct and accessible from the container

### JWT Token Issues
Verify your Ghost Admin Key is valid and hasn't been revoked in Ghost Admin

### Health Check Failures
The container includes built-in health checks. Check logs with:
```bash
docker logs ghost-api-proxy
```

## License

MIT License - see LICENSE file for details.
