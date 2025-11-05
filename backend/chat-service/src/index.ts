import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Rate limiter for match creation endpoint
const matchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 match creation attempts per windowMs (reasonable for a dating app)
  message: 'Too many match requests, please try again later'
});

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
  res.json({ status: 'ok', service: 'chat-service' });
});

// Get matches for a user
app.get('/matches/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      `SELECT id, user_id_1, user_id_2, created_at 
       FROM matches 
       WHERE user_id_1 = $1 OR user_id_2 = $1`,
      [userId]
    );
    
    const matches = result.rows.map(match => ({
      id: match.id,
      userId1: match.user_id_1,
      userId2: match.user_id_2,
      createdAt: match.created_at
    }));
    
    res.json({ success: true, matches });
  } catch (error) {
    console.error('Failed to retrieve matches:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve matches' });
  }
});

// Create a match
app.post('/matches', matchLimiter, async (req: Request, res: Response) => {
  try {
    const { userId1, userId2 } = req.body;
    
    if (!userId1 || !userId2) {
      return res.status(400).json({ success: false, error: 'Both userIds are required' });
    }
    
    // Check for existing match in both directions
    const existingMatch = await pool.query(
      `SELECT id, user_id_1, user_id_2, created_at 
       FROM matches 
       WHERE (user_id_1 = $1 AND user_id_2 = $2) 
          OR (user_id_1 = $2 AND user_id_2 = $1)`,
      [userId1, userId2]
    );
    
    // If match already exists, return the existing match
    if (existingMatch.rows.length > 0) {
      const match = existingMatch.rows[0];
      return res.json({ 
        success: true, 
        match: {
          id: match.id,
          userId1: match.user_id_1,
          userId2: match.user_id_2,
          createdAt: match.created_at
        },
        alreadyExists: true
      });
    }
    
    // Create new match only if it doesn't exist
    const matchId = `match_${Date.now()}`;
    
    const result = await pool.query(
      `INSERT INTO matches (id, user_id_1, user_id_2) 
       VALUES ($1, $2, $3) 
       RETURNING id, user_id_1, user_id_2, created_at`,
      [matchId, userId1, userId2]
    );
    
    const match = result.rows[0];
    
    res.json({ 
      success: true, 
      match: {
        id: match.id,
        userId1: match.user_id_1,
        userId2: match.user_id_2,
        createdAt: match.created_at
      }
    });
  } catch (error) {
    console.error('Failed to create match:', error);
    res.status(500).json({ success: false, error: 'Failed to create match' });
  }
});

// Get messages for a match
app.get('/messages/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    
    const result = await pool.query(
      `SELECT id, match_id, sender_id, text, created_at 
       FROM messages 
       WHERE match_id = $1 
       ORDER BY created_at ASC`,
      [matchId]
    );
    
    const messages = result.rows.map(msg => ({
      id: msg.id,
      matchId: msg.match_id,
      senderId: msg.sender_id,
      text: msg.text,
      timestamp: msg.created_at
    }));
    
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Failed to retrieve messages:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve messages' });
  }
});

// Send a message
app.post('/messages', async (req: Request, res: Response) => {
  try {
    const { matchId, senderId, text } = req.body;

    if (!matchId || !senderId || !text) {
      return res.status(400).json({ success: false, error: 'matchId, senderId, and text are required' });
    }

    const messageId = `msg_${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO messages (id, match_id, sender_id, text)
       VALUES ($1, $2, $3, $4)
       RETURNING id, match_id, sender_id, text, created_at`,
      [messageId, matchId, senderId, text]
    );

    const message = result.rows[0];

    res.json({
      success: true,
      message: {
        id: message.id,
        matchId: message.match_id,
        senderId: message.sender_id,
        text: message.text,
        timestamp: message.created_at
      }
    });
  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// Get unread message counts for all matches of a user
app.get('/matches/:userId/unread-counts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get unread counts for each match
    // A message is unread if it was sent by someone else and created after the user last viewed the chat
    // For MVP, we'll count all messages not sent by the user as potentially unread
    const result = await pool.query(
      `SELECT m.match_id, COUNT(msg.id) as unread_count
       FROM matches m
       LEFT JOIN messages msg ON msg.match_id = m.id AND msg.sender_id != $1
       WHERE m.user_id_1 = $1 OR m.user_id_2 = $1
       GROUP BY m.match_id`,
      [userId]
    );

    const unreadCounts: { [key: string]: number } = {};
    result.rows.forEach(row => {
      unreadCounts[row.match_id] = parseInt(row.unread_count) || 0;
    });

    res.json({ success: true, unreadCounts });
  } catch (error) {
    console.error('Failed to get unread counts:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread counts' });
  }
});

// Mark messages as read (placeholder for future implementation)
// This would require adding a read_at timestamp to messages or a separate read_receipts table
app.put('/messages/:matchId/mark-read', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    // For now, just return success
    // In a full implementation, this would update a read_receipts table or add timestamps
    res.json({ success: true, message: 'Messages marked as read (placeholder)' });
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark messages as read' });
  }
});

// ===== SAFETY & MODERATION ENDPOINTS =====

// Delete a match (unmatch)
app.delete('/matches/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;

    const result = await pool.query(
      `DELETE FROM matches WHERE id = $1 RETURNING id`,
      [matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // Also delete associated messages
    await pool.query(
      `DELETE FROM messages WHERE match_id = $1`,
      [matchId]
    );

    res.json({ success: true, message: 'Match deleted successfully' });
  } catch (error) {
    console.error('Failed to delete match:', error);
    res.status(500).json({ success: false, error: 'Failed to delete match' });
  }
});

// Block a user
app.post('/blocks', async (req: Request, res: Response) => {
  try {
    const { userId, blockedUserId, reason } = req.body;

    if (!userId || !blockedUserId) {
      return res.status(400).json({ success: false, error: 'userId and blockedUserId are required' });
    }

    if (userId === blockedUserId) {
      return res.status(400).json({ success: false, error: 'Cannot block yourself' });
    }

    // Check if already blocked
    const existing = await pool.query(
      `SELECT id FROM blocks WHERE user_id = $1 AND blocked_user_id = $2`,
      [userId, blockedUserId]
    );

    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'User already blocked' });
    }

    const blockId = `block_${Date.now()}`;

    await pool.query(
      `INSERT INTO blocks (id, user_id, blocked_user_id, reason)
       VALUES ($1, $2, $3, $4)`,
      [blockId, userId, blockedUserId, reason || null]
    );

    // Delete any existing matches
    await pool.query(
      `DELETE FROM matches
       WHERE (user_id_1 = $1 AND user_id_2 = $2)
          OR (user_id_1 = $2 AND user_id_2 = $1)`,
      [userId, blockedUserId]
    );

    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('Failed to block user:', error);
    res.status(500).json({ success: false, error: 'Failed to block user' });
  }
});

// Unblock a user
app.delete('/blocks/:userId/:blockedUserId', async (req: Request, res: Response) => {
  try {
    const { userId, blockedUserId } = req.params;

    const result = await pool.query(
      `DELETE FROM blocks WHERE user_id = $1 AND blocked_user_id = $2 RETURNING id`,
      [userId, blockedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Block not found' });
    }

    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Failed to unblock user:', error);
    res.status(500).json({ success: false, error: 'Failed to unblock user' });
  }
});

// Get blocked users for a user
app.get('/blocks/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id, user_id, blocked_user_id, reason, created_at
       FROM blocks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const blockedUsers = result.rows.map(block => ({
      id: block.id,
      userId: block.user_id,
      blockedUserId: block.blocked_user_id,
      reason: block.reason,
      createdAt: block.created_at
    }));

    res.json({ success: true, blockedUsers });
  } catch (error) {
    console.error('Failed to retrieve blocked users:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve blocked users' });
  }
});

// Report a user
app.post('/reports', async (req: Request, res: Response) => {
  try {
    const { reporterId, reportedUserId, reason, details } = req.body;

    if (!reporterId || !reportedUserId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'reporterId, reportedUserId, and reason are required'
      });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({ success: false, error: 'Cannot report yourself' });
    }

    const reportId = `report_${Date.now()}`;

    await pool.query(
      `INSERT INTO reports (id, reporter_id, reported_user_id, reason, details, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportId, reporterId, reportedUserId, reason, details || null, 'pending']
    );

    res.json({
      success: true,
      message: 'Report submitted successfully. Our moderation team will review it.'
    });
  } catch (error) {
    console.error('Failed to submit report:', error);
    res.status(500).json({ success: false, error: 'Failed to submit report' });
  }
});

// Get reports (for moderation - would need admin auth in production)
app.get('/reports', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let query = `SELECT id, reporter_id, reported_user_id, reason, details, status, created_at
                 FROM reports`;
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    const reports = result.rows.map(report => ({
      id: report.id,
      reporterId: report.reporter_id,
      reportedUserId: report.reported_user_id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.created_at
    }));

    res.json({ success: true, reports });
  } catch (error) {
    console.error('Failed to retrieve reports:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve reports' });
  }
});

app.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`);
});
