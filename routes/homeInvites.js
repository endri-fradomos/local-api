import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /home-invites
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM home_invites');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /home-invites/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM home_invites WHERE id = ?', [
      req.params.id
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /home-invites
router.post('/', async (req, res, next) => {
  const { home_id, invited_by, invitee_id } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO home_invites (home_id, invited_by, invitee_id) VALUES (?, ?, ?)',
      [home_id, invited_by, invitee_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /home-invites/:id
router.put('/:id', async (req, res, next) => {
  const { status } = req.body; // 'pending', 'accepted', 'declined'
  try {
    const [result] = await pool.query(
      'UPDATE home_invites SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });
    res.json({ message: 'Invite updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /home-invites/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM home_invites WHERE id = ?', [
      req.params.id
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });
    res.json({ message: 'Invite deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
