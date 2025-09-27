import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Protect all homes routes with auth middleware
router.use(requireAuth);

// GET /homes — owned + shared homes
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // 1. Get homes where the user is the admin
    const [ownedHomes] = await pool.query(
      'SELECT *, false AS shared FROM home WHERE admin_id = ?',
      [userId]
    );

    // 2. Get home IDs where the user is a member (not admin)
    // If home_members table doesn't exist, treat as no memberships (fallback to admin-only)
    let memberHomeIds = [];
    try {
      const [memberRows] = await pool.query(
        'SELECT home_id FROM home_members WHERE user_id = ?',
        [userId]
      );
      memberHomeIds = memberRows.map(row => row.home_id);
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // If home_members table missing, try to find accepted invites (status = 1) for this user's email.
        try {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteRows] = await pool.query('SELECT DISTINCT home_id FROM home_invites WHERE email = ? AND status = 1', [email]);
            memberHomeIds = inviteRows.map(r => r.home_id);
            if (memberHomeIds.length) {
              console.warn('Using home_invites to determine memberships for user', userId);
            } else {
              console.warn('Warning: home_members table not found — no accepted invites found for user.');
            }
          } else {
            console.warn('Warning: home_members table not found and user email not found; membership checks disabled.');
            memberHomeIds = [];
          }
        } catch (innerErr) {
          console.warn('Warning while checking home_invites fallback:', innerErr.message || innerErr);
          memberHomeIds = [];
        }
      } else {
        throw e;
      }
    }

    let sharedHomes = [];
    if (memberHomeIds.length > 0) {
      const placeholders = memberHomeIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT *, true AS shared FROM home WHERE id IN (${placeholders}) AND admin_id != ?`,
        [...memberHomeIds, userId] // prevents showing admin-owned homes again
      );
      sharedHomes = rows;
    }

    // 3. Merge both arrays (deduplicated by home ID)
    const mergedMap = new Map();
    [...ownedHomes, ...sharedHomes].forEach(home => {
      mergedMap.set(home.id, home);
    });

    const mergedHomes = Array.from(mergedMap.values());
    res.json(mergedHomes);
  } catch (err) {
    next(err);
  }
});

// POST /homes — create a new home
router.post('/', async (req, res, next) => {
  const { name } = req.body;
  try {
    const userId = req.user.userId;
    const [result] = await pool.query(
      'INSERT INTO home (name, admin_id) VALUES (?, ?)',
      [name, userId]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /homes/:id — update home name
router.put('/:id', async (req, res, next) => {
  const { name } = req.body;
  try {
    const userId = req.user.userId;
    const [result] = await pool.query(
      'UPDATE home SET name = ? WHERE id = ? AND admin_id = ?',
      [name, req.params.id, userId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Home not found or not owned by user' });
    }
    res.json({ message: 'Home updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /homes/:id — delete a home
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [result] = await pool.query(
      'DELETE FROM home WHERE id = ? AND admin_id = ?',
      [req.params.id, userId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Home not found or not owned by user' });
    }
    res.json({ message: 'Home deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;