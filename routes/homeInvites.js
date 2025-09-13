import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// ✅ GET all invites (admin/debug)
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM home_invites');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ✅ GET invites for a specific user (only pending)
router.get('/user/:inviteeId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT hi.*,
              u1.first_name AS invited_by_first_name,
              u1.last_name AS invited_by_last_name,
              h.name AS house_name
       FROM home_invites hi
       JOIN users u1 ON hi.invited_by = u1.id
       JOIN homes h ON hi.home_id = h.id
       WHERE hi.invitee_id = ? AND hi.status = 'pending'`,
      [req.params.inviteeId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ✅ GET a single invite by ID
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

// ✅ POST a new invite
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

// ✅ PUT: Accept or Decline an invite
router.put('/:id', async (req, res, next) => {
  const { status } = req.body;

  try {
    if (status === 'declined') {
      // ⛔ Delete the invite instead of updating status
      const [result] = await pool.query('DELETE FROM home_invites WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });
      return res.json({ message: 'Invite declined and deleted' });
    }

    // ✅ Accept: update status
    const [result] = await pool.query(
      'UPDATE home_invites SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });

    if (status === 'accepted') {
      const [inviteRows] = await pool.query('SELECT * FROM home_invites WHERE id = ?', [req.params.id]);
      if (inviteRows.length) {
        const { home_id, invitee_id } = inviteRows[0];

        const [existing] = await pool.query(
          'SELECT * FROM home_members WHERE home_id = ? AND user_id = ?',
          [home_id, invitee_id]
        );
        if (existing.length === 0) {
          await pool.query(
            'INSERT INTO home_members (home_id, user_id, role) VALUES (?, ?, ?)',
            [home_id, invitee_id, 'member']
          );
        }
      }
    }

    res.json({ message: 'Invite accepted' });
  } catch (err) {
    next(err);
  }
});

// ✅ DELETE an invite manually
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