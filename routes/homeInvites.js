import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Require authentication for all invite routes (or just for POST if you prefer)
router.use(requireAuth);

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
// changed to accept email and treat status as integer (0 = pending)
router.get('/user/:email', async (req, res, next) => {
  try {
    const email = req.params.email;
    const [rows] = await pool.query(
      `SELECT hi.*, h.name AS house_name
       FROM home_invites hi
       JOIN home h ON hi.home_id = h.id
       WHERE hi.email = ? AND hi.status = 0`,
      [email]
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
// now expects: { email, role, home_id } — status defaults to 0 (pending)
router.post('/', async (req, res, next) => {
  const { email, role, home_id } = req.body;
  try {
    // Check if requester is admin of the home
    const [homeRows] = await pool.query('SELECT admin_id FROM home WHERE id = ?', [home_id]);
    if (!homeRows.length) {
      return res.status(404).json({ error: 'Home not found' });
    }
    if (homeRows[0].admin_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the home admin can add invites' });
    }
    if (!email || !role || !home_id) {
      return res.status(400).json({ error: 'email, role and home_id are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO home_invites (email, role, status, home_id) VALUES (?, ?, ?, ?)',
      [email, role, 0, home_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// ✅ PUT: Accept or Decline an invite
// body.status may be numeric or string 'accepted'/'declined'
router.put('/:id', async (req, res, next) => {
  const { status } = req.body;

  try {
    // handle explicit 'declined' string -> delete invite
    if (status === 'declined' || status === 'delete' || status === 2) {
      const [result] = await pool.query('DELETE FROM home_invites WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });
      return res.json({ message: 'Invite declined and deleted' });
    }

    // normalize accepted -> numeric 1, or accept numeric 1
    let newStatus = typeof status === 'number' ? status : (status === 'accepted' ? 1 : parseInt(status, 10));
    if (Number.isNaN(newStatus)) newStatus = 1;

    // update invite status
    const [updateRes] = await pool.query(
      'UPDATE home_invites SET status = ? WHERE id = ?',
      [newStatus, req.params.id]
    );
    if (!updateRes.affectedRows) return res.status(404).json({ error: 'Invite not found' });

    // if accepted (status 1) -> try to add the user to home_members if a user with that email exists
    if (status === 'accepted' || newStatus === 1) {
      const [inviteRows] = await pool.query('SELECT * FROM home_invites WHERE id = ?', [req.params.id]);
      if (inviteRows.length) {
        const { home_id, email, role } = inviteRows[0];
        // look up user by email
        const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length) {
          const userId = users[0].id;
          const [existing] = await pool.query(
            'SELECT * FROM home_members WHERE home_id = ? AND user_id = ?',
            [home_id, userId]
          );
          if (existing.length === 0) {
            try {
              await pool.query(
                'INSERT INTO home_members (home_id, user_id, role) VALUES (?, ?, ?)',
                [home_id, userId, role || 'member']
              );
            } catch (e) {
              if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
                console.warn('Warning: home_members table not found — skipping adding member for accepted invite.');
              } else {
                throw e;
              }
            }
          }
        }
      }
    }

    res.json({ message: 'Invite updated' });
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

// DELETE /delete-own/:inviteId — only the invitee (by email) can delete their invite
router.delete('/delete-own/:inviteId', async (req, res, next) => {
  const inviteId = req.params.inviteId;
  try {
    // Get the invite
    const [invites] = await pool.query('SELECT email FROM home_invites WHERE id = ?', [inviteId]);
    if (!invites.length) return res.status(404).json({ error: 'Invite not found' });

    // Get the logged-in user's email
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
    if (!users.length) return res.status(401).json({ error: 'User not found' });

    if (invites[0].email !== users[0].email) {
      return res.status(403).json({ error: 'You can only delete your own invite' });
    }

    const [result] = await pool.query('DELETE FROM home_invites WHERE id = ?', [inviteId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Invite not found' });

    res.json({ message: 'Invite deleted' });
  } catch (err) {
    next(err);
  }
});

// NEW: GET homes where a given user's email has an accepted invite (status = 1)
router.get('/user/:userId/accepted-homes', async (req, res, next) => {
  const userId = req.params.userId;
  try {
    // find user's email
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const email = users[0].email;

    // fetch homes where there's an invite for this email with status = 1
    const [rows] = await pool.query(
      `SELECT h.*
       FROM home_invites hi
       JOIN home h ON hi.home_id = h.id
       WHERE hi.email = ? AND hi.status = 1`,
      [email]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// NEW: GET rooms for homes where a given user's email has an accepted invite (status = 1)
router.get('/user/:userId/accepted-rooms', async (req, res, next) => {
  const userId = req.params.userId;
  try {
    // find user's email
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const email = users[0].email;

    // fetch rooms for homes where there's an accepted invite for this email
    const [rows] = await pool.query(
      `SELECT r.*
       FROM home_invites hi
       JOIN home h ON hi.home_id = h.id
       JOIN rooms r ON r.home_id = h.id
       WHERE hi.email = ? AND hi.status = 1`,
      [email]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// NEW: GET users who have accepted invites (status = 1) for homes the requester can access
// Returns unique users with an array of home_ids they are accepted for
router.get('/accepted-users/:requesterId', async (req, res, next) => {
  const requesterId = req.params.requesterId;
  try {
    // find requester's email
    const [usersRows] = await pool.query('SELECT email FROM users WHERE id = ?', [requesterId]);
    if (!usersRows.length) return res.status(404).json({ error: 'Requester not found' });
    const requesterEmail = usersRows[0].email;

    // 1) homes where requester is admin
    const [adminHomes] = await pool.query('SELECT id FROM home WHERE admin_id = ?', [requesterId]);
    const adminHomeIds = adminHomes.map(r => r.id);

    // 2) homes where requester is a member (if table exists) — fallback to empty if missing
    let memberHomeIds = [];
    try {
      const [memberRows] = await pool.query('SELECT home_id FROM home_members WHERE user_id = ?', [requesterId]);
      memberHomeIds = memberRows.map(r => r.home_id);
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // no home_members table — continue, we'll still include accepted invites below
        memberHomeIds = [];
      } else {
        throw e;
      }
    }

    // 3) homes where requester has an accepted invite (status = 1)
    const [inviteHomes] = await pool.query('SELECT DISTINCT home_id FROM home_invites WHERE email = ? AND status = 1', [requesterEmail]);
    const inviteHomeIds = inviteHomes.map(r => r.home_id);

    // combine unique accessible home ids
    const accessibleHomeIds = Array.from(new Set([...adminHomeIds, ...memberHomeIds, ...inviteHomeIds]));
    if (accessibleHomeIds.length === 0) return res.json([]);

    // fetch users who have accepted invites (status=1) for those homes
    const placeholders = accessibleHomeIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.username, u.name, u.lastname, u.email, u.phone_nr, u.role AS user_role,
              hi.home_id, hi.role AS invite_role, hi.created_at AS invite_created_at
       FROM home_invites hi
       JOIN users u ON u.email = hi.email
       WHERE hi.status = 1 AND hi.home_id IN (${placeholders})
       ORDER BY u.id`,
      accessibleHomeIds
    );

    // dedupe and aggregate homes per user
    const map = new Map();
    for (const r of rows) {
      const key = r.user_id;
      if (!map.has(key)) {
        map.set(key, {
          id: r.user_id,
          username: r.username,
          name: r.name,
          lastname: r.lastname,
          email: r.email,
          phone_nr: r.phone_nr,
          role: r.user_role,
          homes: []
        });
      }
      map.get(key).homes.push({ home_id: r.home_id, invite_role: r.invite_role, invite_created_at: r.invite_created_at });
    }

    const result = Array.from(map.values());
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;