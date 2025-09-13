import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ✅ GET /rooms/homes/:homeId/rooms — fetch all rooms for a specific home
router.get('/homes/:homeId/rooms', async (req, res, next) => {
  const { homeId } = req.params;

  try {
    // Verify user has access to this home (owner or member)
    const [access] = await pool.query(
      `SELECT id FROM homes WHERE id = ? AND owner_id = ?
       UNION
       SELECT home_id as id FROM home_members WHERE home_id = ? AND user_id = ?`,
      [homeId, req.user.userId, homeId, req.user.userId]
    );

    if (!access.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid homeId' });
    }

    // Get all rooms for this home
    const [rooms] = await pool.query(
      'SELECT id, name, circuit_id, home_id FROM rooms WHERE home_id = ?',
      [homeId]
    );

    res.json(rooms);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    next(err);
  }
});

// ✅ POST /rooms — create new room linked to home
router.post('/', async (req, res, next) => {
  const { home_id, name, circuit_id } = req.body;

  try {
    if (!home_id || !name) {
      return res.status(400).json({ error: 'home_id and name are required' });
    }

    // Verify user has access to the home before inserting
    const [access] = await pool.query(
      `SELECT id FROM homes WHERE id = ? AND owner_id = ?
       UNION
       SELECT home_id as id FROM home_members WHERE home_id = ? AND user_id = ?`,
      [home_id, req.user.userId, home_id, req.user.userId]
    );

    if (!access.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid home_id' });
    }

    // Insert new room
    const [result] = await pool.query(
      'INSERT INTO rooms (home_id, name, circuit_id) VALUES (?, ?, ?)',
      [home_id, name, circuit_id || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error inserting room:', err);
    next(err);
  }
});

// NEW: GET /rooms/:roomId — fetch single room info by ID with access check
router.get('/:roomId', async (req, res, next) => {
  const { roomId } = req.params;

  try {
    // Verify user has access to the room via home owner or member
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.circuit_id, r.home_id
       FROM rooms r
       JOIN homes h ON r.home_id = h.id
       LEFT JOIN home_members hm ON h.id = hm.home_id
       WHERE r.id = ? AND (h.owner_id = ? OR hm.user_id = ?)`,
      [roomId, req.user.userId, req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Room not found or access denied' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching room:', err);
    next(err);
  }
});

// NEW: GET /devices/room/:roomId — fetch all devices for a specific room with access control
router.get('/devices/room/:roomId', async (req, res, next) => {
  const { roomId } = req.params;

  try {
    // Verify user has access to the room via home owner or member
    const [roomAccess] = await pool.query(
      `SELECT r.id FROM rooms r
       JOIN homes h ON r.home_id = h.id
       LEFT JOIN home_members hm ON h.id = hm.home_id
       WHERE r.id = ? AND (h.owner_id = ? OR hm.user_id = ?)`,
      [roomId, req.user.userId, req.user.userId]
    );

    if (!roomAccess.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid roomId' });
    }

    // Fetch devices in the room
    const [devices] = await pool.query(
      'SELECT id, name, type, temperature, mode, power, room_id FROM devices WHERE room_id = ?',
      [roomId]
    );

    res.json(devices);
  } catch (err) {
    console.error('Error fetching devices:', err);
    next(err);
  }
});

// NEW: POST /devices — add new device linked to room
router.post('/devices', async (req, res, next) => {
  const { name, type, room_id } = req.body;

  try {
    if (!name || !type || !room_id) {
      return res.status(400).json({ error: 'name, type, and room_id are required' });
    }

    // Verify user has access to the room via home owner or member
    const [roomAccess] = await pool.query(
      `SELECT r.id, r.home_id FROM rooms r
       JOIN homes h ON r.home_id = h.id
       LEFT JOIN home_members hm ON h.id = hm.home_id
       WHERE r.id = ? AND (h.owner_id = ? OR hm.user_id = ?)`,
      [room_id, req.user.userId, req.user.userId]
    );

    if (!roomAccess.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid room_id' });
    }

    // Insert device, setting defaults for AC fields if needed
    let query = 'INSERT INTO devices (name, type, room_id';
    let placeholders = '?, ?, ?';
    const params = [name, type, room_id];

    if (type === 'ac') {
      // Set defaults for AC fields (temperature, mode, power)
      query += ', temperature, mode, power)';
      placeholders += ', ?, ?, ?';
      params.push(22, 'cool', false);
    } else {
      query += ')';
    }

    query += ` VALUES (${placeholders})`;

    const [result] = await pool.query(query, params);

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error inserting device:', err);
    next(err);
  }
});

export default router;