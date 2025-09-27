import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /devices — all devices from homes the user owns or is a member of
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // 1. Get owned home IDs (admin_id)
    const [ownedHomes] = await pool.query(
      'SELECT id FROM home WHERE admin_id = ?',
      [userId]
    );
    const ownedHomeIds = ownedHomes.map((home) => home.id);

    // 2. Get member home IDs, but handle missing home_members table
    let sharedHomeIds = [];
    try {
      const [sharedHomes] = await pool.query('SELECT home_id FROM home_members WHERE user_id = ?', [userId]);
      sharedHomeIds = sharedHomes.map((home) => home.home_id);
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // try to use home_invites for accepted invites
        try {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteRows] = await pool.query('SELECT DISTINCT home_id FROM home_invites WHERE email = ? AND status = 1', [email]);
            sharedHomeIds = inviteRows.map(r => r.home_id);
            if (sharedHomeIds.length) console.warn('Using home_invites to determine shared homes for user', userId);
          } else {
            sharedHomeIds = [];
          }
        } catch (innerErr) {
          console.warn('Warning while checking home_invites fallback:', innerErr.message || innerErr);
          sharedHomeIds = [];
        }
       } else {
         throw e;
       }
     }

    // 3. Combine all accessible home IDs
    const allHomeIds = [...new Set([...ownedHomeIds, ...sharedHomeIds])];

    if (allHomeIds.length === 0) return res.json([]);

    const placeholders = allHomeIds.map(() => '?').join(',');

    const [devices] = await pool.query(`
      SELECT devices.id, devices.name, devices.category, devices.status, devices.room_id, devices.created_at
      FROM devices
      JOIN rooms ON devices.room_id = rooms.id
      JOIN home ON rooms.home_id = home.id
      WHERE home.id IN (${placeholders})
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

    // Check access to the home that this room belongs to (admin or member)
    let access;
    try {
      [access] = await pool.query(`
        SELECT home.id
        FROM home
        JOIN rooms ON home.id = rooms.home_id
        WHERE rooms.id = ? AND (home.admin_id = ? OR home.id IN (
          SELECT home_id FROM home_members WHERE user_id = ?
        ))
      `, [roomId, userId, userId]);
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // fallback: admin-only then invite-based
        const [adminOnly] = await pool.query(`
          SELECT home.id
          FROM home
          JOIN rooms ON home.id = rooms.home_id
          WHERE rooms.id = ? AND home.admin_id = ?
        `, [roomId, userId]);
        if (adminOnly.length) {
          access = adminOnly;
        } else {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteRows] = await pool.query(`
              SELECT home.id
              FROM home
              JOIN home_invites hi ON home.id = hi.home_id
              JOIN rooms r ON r.home_id = home.id
              WHERE r.id = ? AND hi.email = ? AND hi.status = 1
            `, [roomId, email]);
            access = inviteRows;
            if (inviteRows.length) console.warn('Access granted via home_invites for devices.room', roomId);
          } else {
            access = [];
          }
        }
        if (!access.length) console.warn('Warning: home_members table missing — no access via fallback for devices.room.');
      } else {
        throw e;
      }
    }

    if (!access.length) {
      return res.status(403).json({ error: 'Unauthorized or room not found' });
    }

    const [devices] = await pool.query(
      'SELECT id, name, category, status, room_id, created_at FROM devices WHERE room_id = ?',
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
    const [rows] = await pool.query('SELECT id, name, category, status, room_id, created_at FROM devices WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /devices
router.post('/', async (req, res, next) => {
  const { room_id, name, category, status } = req.body;
  try {
    if (!room_id || !name || !category || typeof status === 'undefined') {
      return res.status(400).json({ error: 'room_id, name, category and status are required' });
    }

    // Verify user has access to the room (admin or member)
    let roomAccess;
    try {
      [roomAccess] = await pool.query(`
        SELECT r.id
        FROM rooms r
        JOIN home h ON r.home_id = h.id
        LEFT JOIN home_members hm ON h.id = hm.home_id
        WHERE r.id = ? AND (h.admin_id = ? OR hm.user_id = ?)
      `, [room_id, req.user.userId, req.user.userId]);
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // fallback admin-only then invite-based
        const [adminOnly] = await pool.query(`
          SELECT r.id
          FROM rooms r
          JOIN home h ON r.home_id = h.id
          WHERE r.id = ? AND h.admin_id = ?
        `, [room_id, req.user.userId]);
        if (adminOnly.length) {
          roomAccess = adminOnly;
        } else {
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteCheck] = await pool.query(`
              SELECT r.id
              FROM rooms r
              JOIN home_invites hi ON r.home_id = hi.home_id
              WHERE r.id = ? AND hi.email = ? AND hi.status = 1
            `, [room_id, email]);
            roomAccess = inviteCheck;
            if (inviteCheck.length) console.warn('Access granted via home_invites for POST /devices in room', room_id);
          } else {
            roomAccess = [];
          }
        }
        if (!roomAccess.length) console.warn('Warning: home_members table missing — no access via fallback for POST /devices.');
      } else {
        throw e;
      }
    }

    if (!roomAccess.length) {
      return res.status(403).json({ error: 'Unauthorized or invalid room_id' });
    }

    const [result] = await pool.query(
      'INSERT INTO devices (name, category, status, room_id) VALUES (?, ?, ?, ?)',
      [name, category, status, room_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /devices/:id
router.put('/:id', async (req, res, next) => {
  const { name, category, status } = req.body;
  const deviceId = req.params.id;

  try {
    // basic validation
    if (typeof status === 'undefined' && typeof name === 'undefined' && typeof category === 'undefined') {
      return res.status(400).json({ error: 'At least one of name, category or status is required' });
    }

    // Verify user has access to this device via its room -> home (admin or member)
    let access;
    try {
      const [rows] = await pool.query(
        `SELECT d.id
         FROM devices d
         JOIN rooms r ON d.room_id = r.id
         JOIN home h ON r.home_id = h.id
         LEFT JOIN home_members hm ON h.id = hm.home_id
         WHERE d.id = ? AND (h.admin_id = ? OR hm.user_id = ?)`,
        [deviceId, req.user.userId, req.user.userId]
      );
      access = rows;
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes('home_members')))) {
        // home_members missing: try admin-only then invite-based (home_invites.status = 1) access by user's email
        const [adminRows] = await pool.query(
          `SELECT d.id
           FROM devices d
           JOIN rooms r ON d.room_id = r.id
           JOIN home h ON r.home_id = h.id
           WHERE d.id = ? AND h.admin_id = ?`,
          [deviceId, req.user.userId]
        );
        if (adminRows.length) {
          access = adminRows;
        } else {
          // check home_invites for accepted invite
          const [userRows] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
          if (userRows.length) {
            const email = userRows[0].email;
            const [inviteRows] = await pool.query(
              `SELECT d.id
               FROM devices d
               JOIN rooms r ON d.room_id = r.id
               JOIN home_invites hi ON r.home_id = hi.home_id
               WHERE d.id = ? AND hi.email = ? AND hi.status = 1`,
              [deviceId, email]
            );
            access = inviteRows;
            if (inviteRows.length) console.warn('Access granted via home_invites for updating device', deviceId);
          } else {
            access = [];
          }
        }
        if (!access.length) console.warn('Warning: home_members table missing — no access via fallback for updating device.');
      } else {
        throw e;
      }
    }

    if (!access || access.length === 0) {
      return res.status(403).json({ error: 'Unauthorized or device not found' });
    }

    // Build update statement dynamically to avoid overwriting unchanged fields
    const fields = [];
    const params = [];

    if (typeof name !== 'undefined') {
      fields.push('name = ?');
      params.push(name);
    }
    if (typeof category !== 'undefined') {
      fields.push('category = ?');
      params.push(category);
    }
    if (typeof status !== 'undefined') {
      // ensure numeric status stored as integer
      const parsed = Number(status);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ error: 'status must be a number' });
      }
      fields.push('status = ?');
      params.push(parsed);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(deviceId);
    const sql = `UPDATE devices SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(sql, params);

    if (!result.affectedRows) return res.status(404).json({ error: 'Device not found' });

    // Return updated device row
    const [updatedRows] = await pool.query(
      'SELECT id, name, category, status, room_id, created_at FROM devices WHERE id = ?',
      [deviceId]
    );

    res.json({ message: 'Device updated', device: updatedRows[0] });
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