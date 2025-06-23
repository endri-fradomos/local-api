import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /home-members
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM home_members');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /home-members/:home_id/:user_id
router.get('/:home_id/:user_id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM home_members WHERE home_id = ? AND user_id = ?',
      [req.params.home_id, req.params.user_id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Member not found in this home' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /home-members
router.post('/', async (req, res, next) => {
  const { home_id, user_id, role } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO home_members (home_id, user_id, role) VALUES (?, ?, ?)',
      [home_id, user_id, role || 'member']
    );
    // primary key is composite; insertId not useful – return what was added
    res.status(201).json({ home_id, user_id });
  } catch (err) {
    next(err);
  }
});

// PUT /home-members/:home_id/:user_id
router.put('/:home_id/:user_id', async (req, res, next) => {
  const { role } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE home_members SET role = ? WHERE home_id = ? AND user_id = ?',
      [role, req.params.home_id, req.params.user_id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: 'Member not found in this home' });
    res.json({ message: 'Member role updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /home-members/:home_id/:user_id
router.delete('/:home_id/:user_id', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM home_members WHERE home_id = ? AND user_id = ?',
      [req.params.home_id, req.params.user_id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: 'Member not found in this home' });
    res.json({ message: 'Member removed from home' });
  } catch (err) {
    next(err);
  }
});

export default router;
