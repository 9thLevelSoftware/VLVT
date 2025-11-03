import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'profile-service' });
});

// Create profile
app.post('/profile', async (req: Request, res: Response) => {
  try {
    const { userId, name, age, bio, photos, interests } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO profiles (user_id, name, age, bio, photos, interests) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING user_id, name, age, bio, photos, interests, created_at, updated_at`,
      [userId, name, age, bio, photos || [], interests || []]
    );
    
    const profile = result.rows[0];
    
    res.json({ 
      success: true, 
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: profile.photos,
        interests: profile.interests
      }
    });
  } catch (error) {
    console.error('Failed to save profile:', error);
    res.status(500).json({ success: false, error: 'Failed to save profile' });
  }
});

// Get profile by userId
app.get('/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      `SELECT user_id, name, age, bio, photos, interests, created_at, updated_at 
       FROM profiles 
       WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    
    const profile = result.rows[0];
    
    res.json({ 
      success: true, 
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: profile.photos,
        interests: profile.interests
      }
    });
  } catch (error) {
    console.error('Failed to retrieve profile:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve profile' });
  }
});

// Update profile
app.put('/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { name, age, bio, photos, interests } = req.body;
    
    const result = await pool.query(
      `UPDATE profiles 
       SET name = COALESCE($2, name),
           age = COALESCE($3, age),
           bio = COALESCE($4, bio),
           photos = COALESCE($5, photos),
           interests = COALESCE($6, interests),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING user_id, name, age, bio, photos, interests, created_at, updated_at`,
      [userId, name, age, bio, photos, interests]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    
    const profile = result.rows[0];
    
    res.json({ 
      success: true, 
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: profile.photos,
        interests: profile.interests
      }
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// Delete profile
app.delete('/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      `DELETE FROM profiles WHERE user_id = $1 RETURNING user_id`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    
    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    console.error('Failed to delete profile:', error);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
});

// Get random profiles for discovery
app.get('/profiles/discover', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT user_id, name, age, bio, photos, interests 
       FROM profiles 
       ORDER BY RANDOM() 
       LIMIT 10`
    );
    
    const profiles = result.rows.map(profile => ({
      userId: profile.user_id,
      name: profile.name,
      age: profile.age,
      bio: profile.bio,
      photos: profile.photos,
      interests: profile.interests
    }));
    
    res.json({ success: true, profiles });
  } catch (error) {
    console.error('Failed to retrieve profiles:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve profiles' });
  }
});

app.listen(PORT, () => {
  console.log(`Profile service running on port ${PORT}`);
});
