import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /devices
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM devices');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /devices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [
      req.params.id
    ]);
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
    const [result] = await pool.query('DELETE FROM devices WHERE id = ?', [
      req.params.id
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
