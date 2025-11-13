import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tambahkan interceptor untuk menyisipkan token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt-token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


// API untuk User/Auth
export const authApi = {
  login: (data: { email: string; password: string }) => 
    apiClient.post('/api/users/login', data),
    
  register: (data: { name: string; email: string; password: string }) =>
    apiClient.post('/api/users/register', data),
    
  getMe: () => 
    apiClient.get('/api/users/me'),
};

// Ganti userApi lama dengan authApi
// Hapus/Komentari userApi lama
/*
export const userApi = {
  getUsers: () => apiClient.get('/api/users'),
  ...
};
*/