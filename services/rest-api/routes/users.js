const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validateRegister, validateLogin } = require('../middleware/validation');

const router = express.Router();

// Database In-memory (ganti dengan database sungguhan di produksi)
const users = [];

// Ambil Kunci dari Environment Variables
const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const publicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

// POST /api/users/register - Registrasi user baru
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      teams: [], // Tambahan untuk 'teams'
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    console.log('User registered:', newUser.email);

    res.status(201).json({
      message: 'User created successfully',
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// POST /api/users/login - Login user dan dapatkan JWT
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Buat JWT Payload
    const payload = {
      sub: user.id, // Subject (standard JWT claim)
      name: user.name,
      email: user.email,
    };

    // Buat token menggunakan Private Key
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256', // Algoritma Asymmetric
      expiresIn: '1h' // Token berlaku 1 jam
    });

    console.log('User logged in:', user.email);
    res.json({
      message: 'Login successful',
      token: token
    });

  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/users/auth/public-key - Endpoint untuk API Gateway
// Ini adalah endpoint PUBLIK baru
router.get('/auth/public-key', (req, res) => {
  // Kirim public key sebagai plain text
  res.type('application/x-pem-file').send(publicKey);
});

// GET /api/users/me - Contoh rute terproteksi
// Rute ini akan mengandalkan API Gateway untuk verifikasi
router.get('/me', (req, res) => {
  // Gateway akan menambahkan header 'x-user-id' setelah verifikasi token
  const userId = req.headers['x-user-id']; 
  if(!userId) {
    // Ini seharusnya tidak terjadi jika gateway disetup dgn benar
    return res.status(401).json({ error: 'Not authorized' });
  }

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    teams: user.teams
  });
});

// Hapus semua rute lama (GET /, GET /:id, POST /, PUT /, DELETE /)
// ...

module.exports = router;