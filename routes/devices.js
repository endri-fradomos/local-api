import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /devices — all devices from homes the user owns or is a member of
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // 1. Get owned home IDs
    const [ownedHomes] = await pool.query(
      'SELECT id FROM homes WHERE owner_id = ?',
      [userId]
    );
    const ownedHomeIds = ownedHomes.map((home) => home.id);

    // 2. Get member home IDs
    const [sharedHomes] = await pool.query(
      'SELECT home_id FROM home_members WHERE user_id = ?',
      [userId]
    );
    const sharedHomeIds = sharedHomes.map((home) => home.home_id);

    // 3. Combine all accessible home IDs
    const allHomeIds = [...new Set([...ownedHomeIds, ...sharedHomeIds])];

    if (allHomeIds.length === 0) return res.json([]);

    const placeholders = allHomeIds.map(() => '?').join(',');

    const [devices] = await pool.query(`
      SELECT devices.*
      FROM devices
      JOIN rooms ON devices.room_id = rooms.id
      JOIN homes ON rooms.home_id = homes.id
      WHERE homes.id IN (${placeholders})
    `, allHomeIds);

    res.json(devices);
  } catch (err) {
    next(err);
  }
});

// GET /devices/room/:roomId — devices from one room (only if user has access to the home)
router.get('/room/:roomId', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { roomId } = req.params;

    // Check access to the home that this room belongs to
    const [access] = await pool.query(`
      SELECT homes.id
      FROM homes
      JOIN rooms ON homes.id = rooms.home_id
      WHERE rooms.id = ? AND (homes.owner_id = ? OR homes.id IN (
        SELECT home_id FROM home_members WHERE user_id = ?
      ))
    `, [roomId, userId, userId]);

    if (!access.length) {
      return res.status(403).json({ error: 'Unauthorized or room not found' });
    }

    const [devices] = await pool.query(
      'SELECT * FROM devices WHERE room_id = ?',
      [roomId]
    );

    res.json(devices);
  } catch (err) {
    next(err);
  }
});

// GET /devices/:id — single device
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /devices
router.post('/', async (req, res, next) => {
  const { room_id, type, name } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO devices (room_id, type, name) VALUES (?, ?, ?)',
      [room_id, type, name]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /devices/:id
router.put('/:id', async (req, res, next) => {
  const { type, name } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE devices SET type = ?, name = ? WHERE id = ?',
      [type, name, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /devices/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;