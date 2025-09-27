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
    // Verify user has access to this home (admin or member)
    let access;
    try {
      [access] = await pool.query(
        `SELECT id FROM home WHERE id = ? AND admin_id = ?
         UNION
         SELECT home_id as id FROM home_members WHERE home_id = ? AND user_id = ?`,
        [homeId, req.user.userId, homeId, req.user.userId]
      );
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // fallback: first try admin-only, then check home_invites (status = 1) for this user's email
        const [adminCheck] = await pool.query('SELECT id FROM home WHERE id = ? AND admin_id = ?', [homeId, req.user.userId]);
        if (adminCheck.length) {
          access = adminCheck;
        } else {
          // check invites
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteCheck] = await pool.query('SELECT home_id AS id FROM home_invites WHERE email = ? AND status = 1 AND home_id = ?', [email, homeId]);
            access = inviteCheck;
            if (inviteCheck.length) console.warn('Access granted via home_invites for user', req.user.userId);
          } else {
            access = [];
          }
        }
        if (!access.length) console.warn('Warning: home_members table missing — fallback checks failed for rooms.');
      } else {
        throw e;
      }
    }

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
      `SELECT id FROM home WHERE id = ? AND admin_id = ?
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
    // Verify user has access to the room via home admin or member
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT r.id, r.name, r.circuit_id, r.home_id
         FROM rooms r
         JOIN home h ON r.home_id = h.id
         LEFT JOIN home_members hm ON h.id = hm.home_id
         WHERE r.id = ? AND (h.admin_id = ? OR hm.user_id = ?)`,
        [roomId, req.user.userId, req.user.userId]
      );
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // fallback to admin-only check, then check invites for that room's home
        const [fallbackRows] = await pool.query(
          `SELECT r.id, r.name, r.circuit_id, r.home_id
           FROM rooms r
           JOIN home h ON r.home_id = h.id
           WHERE r.id = ? AND h.admin_id = ?`,
          [roomId, req.user.userId]
        );
        if (fallbackRows.length) {
          rows = fallbackRows;
        } else {
          // try invite-based access
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteRows] = await pool.query(
              `SELECT r.id, r.name, r.circuit_id, r.home_id
               FROM rooms r
               JOIN home_invites hi ON r.home_id = hi.home_id
               WHERE r.id = ? AND hi.email = ? AND hi.status = 1`,
              [roomId, email]
            );
            rows = inviteRows;
            if (inviteRows.length) console.warn('Access granted via home_invites for room', roomId);
          } else {
            rows = [];
          }
        }
        if (!rows.length) console.warn('Warning: home_members table missing — no access via fallback for single room.');
      } else {
        throw e;
      }
    }

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
    // Verify user has access to the room via home admin or member
    let roomAccess;
    try {
      [roomAccess] = await pool.query(
        `SELECT r.id FROM rooms r
         JOIN home h ON r.home_id = h.id
         LEFT JOIN home_members hm ON h.id = hm.home_id
         WHERE r.id = ? AND (h.admin_id = ? OR hm.user_id = ?)`,
        [roomId, req.user.userId, req.user.userId]
      );
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // admin-only then invite-based fallback
        const [adminOnly] = await pool.query(
          `SELECT r.id FROM rooms r
           JOIN home h ON r.home_id = h.id
           WHERE r.id = ? AND h.admin_id = ?`,
          [roomId, req.user.userId]
        );
        if (adminOnly.length) {
          roomAccess = adminOnly;
        } else {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteCheck] = await pool.query(
              `SELECT r.id
               FROM rooms r
               JOIN home_invites hi ON r.home_id = hi.home_id
               WHERE r.id = ? AND hi.email = ? AND hi.status = 1`,
              [roomId, email]
            );
            roomAccess = inviteCheck;
            if (inviteCheck.length) console.warn('Access granted via home_invites for devices in room', roomId);
          } else {
            roomAccess = [];
          }
        }
        if (!roomAccess.length) console.warn('Warning: home_members table missing — no access via fallback for devices in room.');
      } else {
        throw e;
      }
    }

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

    // Verify user has access to the room via home admin or member
    let roomAccess;
    try {
      [roomAccess] = await pool.query(
        `SELECT r.id, r.home_id FROM rooms r
         JOIN home h ON r.home_id = h.id
         LEFT JOIN home_members hm ON h.id = hm.home_id
         WHERE r.id = ? AND (h.admin_id = ? OR hm.user_id = ?)`,
        [room_id, req.user.userId, req.user.userId]
      );
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        const [adminOnly] = await pool.query(
          `SELECT r.id, r.home_id FROM rooms r
           JOIN home h ON r.home_id = h.id
           WHERE r.id = ? AND h.admin_id = ?`,
          [room_id, req.user.userId]
        );
        if (adminOnly.length) {
          roomAccess = adminOnly;
        } else {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteCheck] = await pool.query(
              `SELECT r.id, r.home_id FROM rooms r
               JOIN home_invites hi ON r.home_id = hi.home_id
               WHERE r.id = ? AND hi.email = ? AND hi.status = 1`,
              [room_id, email]
            );
            roomAccess = inviteCheck;
            if (inviteCheck.length) console.warn('Access granted via home_invites for adding device in room', room_id);
          } else {
            roomAccess = [];
          }
        }
        if (!roomAccess.length) console.warn('Warning: home_members table missing — no access via fallback for adding device.');
      } else {
        throw e;
      }
    }

    if (!roomAccess.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid room_id' });
    }

    // Insert device using new schema
    const [result] = await pool.query(
      'INSERT INTO devices (name, type, room_id) VALUES (?, ?, ?)',
      [name, type, room_id]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error inserting device:', err);
    next(err);
  }
});

export default router;