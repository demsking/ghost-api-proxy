import jwt from 'jsonwebtoken';

// Environment variables configuration
const GHOST_URL = process.env.GHOST_URL;
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY || '';
const GHOST_API_VERSION = process.env.GHOST_API_VERSION || 'v5.0';
const PORT = process.env.PORT || 3000;

if (!GHOST_URL) {
  console.error('GHOST_URL environment variable is required');
  process.exit(1);
}

if (!GHOST_ADMIN_KEY) {
  console.error('GHOST_ADMIN_KEY environment variable is required');
  process.exit(1);
}

// Extract key components from Ghost Admin Key
const [id, secret] = GHOST_ADMIN_KEY.split(':');

if (!id || !secret) {
  console.error('Invalid GHOST_ADMIN_KEY format. Expected format: id:secret');
  process.exit(1);
}

// Generate JWT token for Ghost Admin API
function generateGhostToken(): string {  
  return jwt.sign({}, Buffer.from(secret!, 'hex'), {
    keyid: id,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: `/admin/`
  });
}

// Create Bun server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate Ghost JWT token
    const token = generateGhostToken();
    
    // Extract the Ghost API path from the request
    const ghostApiUrl = `${GHOST_URL}${url.pathname}${url.search}`;
    
    // Forward request to Ghost API
    const ghostResponse = await fetch(ghostApiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': GHOST_API_VERSION,
        'Content-Type': req.headers.get('content-type') || 'application/json',
        'User-Agent': 'Ghost-Proxy/1.0'
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
    });

    // Forward Ghost API response
    const responseData = await ghostResponse.text();
    
    // Forward all headers except compression-related ones
    const responseHeaders = new Headers();
    for (const [key, value] of ghostResponse.headers.entries()) {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    
    return new Response(responseData, {
      status: ghostResponse.status,
      headers: responseHeaders
    });
  },
});

console.log(`🚀 Ghost API Proxy running on port ${PORT}`);
console.log(`📝 Ghost URL: ${GHOST_URL}`);
console.log(`🔗 API Version: ${GHOST_API_VERSION}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Ghost API Proxy...');
  server.stop();
  process.exit(0);
});