const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// URL Service (dari Docker environment)
// NAMA INI PENTING: 'rest-api' dan 'graphql-api' adalah nama service di docker-compose
const USER_SERVICE_URL = process.env.REST_API_URL || 'http://localhost:3001';
const TASK_SERVICE_URL = process.env.GRAPHQL_API_URL || 'http://localhost:4000';

// Variabel untuk menyimpan Public Key
let PUBLIC_KEY = null;

// Fungsi untuk mengambil Public Key dari User Service
const fetchPublicKey = async () => {
  try {
    // Kita panggil service 'rest-api' (User Service)
    const url = `${USER_SERVICE_URL}/api/users/auth/public-key`;
    console.log(`Fetching public key from ${url}`);
    
    const response = await axios.get(url);
    PUBLIC_KEY = response.data;
    console.log('✅ Public Key fetched and stored successfully.');
  } catch (error) {
    console.error('❌ Failed to fetch public key:', error.message);
    console.log('Retrying in 5 seconds...');
    setTimeout(fetchPublicKey, 5000); // Coba lagi setelah 5 detik
  }
};

app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3002', 
    'http://frontend-app:3002'
  ],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Too many requests, please try again later.'
});
app.use(limiter);

// --- Middleware Verifikasi JWT ---
const verifyToken = (req, res, next) => {
  if (!PUBLIC_KEY) {
    return res.status(503).json({ error: 'Service unavailable. Public key not yet fetched.' });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (token == null) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, user) => {
    if (err) {
      console.warn('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    
    // Token valid. Tambahkan payload user ke request header.
    req.headers['x-user-id'] = user.sub;
    req.headers['x-user-name'] = user.name;
    req.headers['x-user-email'] = user.email;
    req.user = user; 
    
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    services: {
      'rest-api (user-svc)': USER_SERVICE_URL,
      'graphql-api (task-svc)': TASK_SERVICE_URL
    }
  });
});

// Proxy untuk REST API (User Service)
const restApiProxy = createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[GW->REST API] ${req.method} ${req.url}`);
    // Inject header 'x-user-*' jika ada (setelah verifyToken)
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-user-name', req.user.name);
      proxyReq.setHeader('x-user-email', req.user.email);
    }
  }
});

// Proxy untuk GraphQL API (Task Service)
const graphqlApiProxy = createProxyMiddleware({
  target: TASK_SERVICE_URL,
  changeOrigin: true,
  ws: true, // PENTING: Aktifkan WebSocket
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[GW->GraphQL API] ${req.method} ${req.url}`);
    // Inject header 'x-user-*' jika ada (setelah verifyToken)
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-user-name', req.user.name);
      proxyReq.setHeader('x-user-email', req.user.email);
    }
  },
  onError: (err, req, res) => {
    console.error('GraphQL Proxy Error:', err);
    res.status(500).json({ error: 'GraphQL service unavailable' });
  }
});

// --- Definisi Rute ---

// RUTE PUBLIK: (Tidak perlu token)
app.use('/api/users/register', restApiProxy);
app.use('/api/users/login', restApiProxy);
app.use('/api/users/auth/public-key', restApiProxy); // Rute untuk ambil public key

// RUTE TERPROTEKSI: (WAJIB pakai token)
app.use('/api/users/me', verifyToken, restApiProxy); 
app.use('/graphql', verifyToken, graphqlApiProxy); // Semua GQL terproteksi

// Catch-all route (JANGAN proxy /api)
// Proxy /api akan menangkap SEMUA /api/* termasuk yg publik
// app.use('/api', verifyToken, restApiProxy); // JANGAN lakukan ini

const server = app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  // Ambil Public Key saat startup
  fetchPublicKey();
});

// // Handle WebSocket upgrade
// server.on('upgrade', (req, socket, head) => {
//   console.log('Attempting WebSocket upgrade...');
//   // Kita proxy WS request ke graphqlApiProxy
//   graphqlApiProxy.ws(req, socket, head);
// });