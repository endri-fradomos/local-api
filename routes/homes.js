import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /homes
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM homes');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /homes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM homes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Home not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /homes
router.post('/', async (req, res, next) => {
  const { name, owner_id } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO homes (name, owner_id) VALUES (?, ?)',
      [name, owner_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /homes/:id
router.put('/:id', async (req, res, next) => {
  const { name } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE homes SET name = ? WHERE id = ?',
      [name, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Home not found' });
    res.json({ message: 'Home updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /homes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM homes WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Home not found' });
    res.json({ message: 'Home deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
