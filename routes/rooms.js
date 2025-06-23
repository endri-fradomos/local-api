import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /rooms
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rooms');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /rooms/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Room not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /rooms
router.post('/', async (req, res, next) => {
  const { home_id, name, circuit_id } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO rooms (home_id, name, circuit_id) VALUES (?, ?, ?)',
      [home_id, name, circuit_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /rooms/:id
router.put('/:id', async (req, res, next) => {
  const { name, circuit_id } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE rooms SET name = ?, circuit_id = ? WHERE id = ?',
      [name, circuit_id, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Room not found' });
    res.json({ message: 'Room updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /rooms/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Room not found' });
    res.json({ message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
