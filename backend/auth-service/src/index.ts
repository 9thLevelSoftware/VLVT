import express, { Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

// Rate limiter for /auth/verify endpoint
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many verification requests, please try again later'
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Sign in with Apple endpoint
app.post('/auth/apple', async (req: Request, res: Response) => {
  try {
    const { identityToken } = req.body;
    
    // In production, verify the Apple identity token
    // For now, we'll create a stub provider ID
    const providerId = `apple_${Date.now()}`;
    const email = `user@apple.example.com`;
    const provider = 'apple';
    
    // Upsert user in database
    const result = await pool.query(
      `INSERT INTO users (id, provider, email) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (id) 
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP, email = $3
       RETURNING id, provider, email`,
      [providerId, provider, email]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, provider: user.provider, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      userId: user.id,
      provider: user.provider
    });
  } catch (error) {
    console.error('Apple authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Sign in with Google endpoint
app.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    
    // In production, verify the Google ID token
    // For now, we'll create a stub provider ID
    const providerId = `google_${Date.now()}`;
    const email = `user@google.example.com`;
    const provider = 'google';
    
    // Upsert user in database
    const result = await pool.query(
      `INSERT INTO users (id, provider, email) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (id) 
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP, email = $3
       RETURNING id, provider, email`,
      [providerId, provider, email]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, provider: user.provider, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      userId: user.id,
      provider: user.provider
    });
  } catch (error) {
    console.error('Google authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Verify token endpoint (with rate limiting)
app.post('/auth/verify', verifyLimiter, (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, decoded });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
