import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// POST - Create a new access permission
router.post('/', async (req, res, next) => {
  const { home_id, user_id, day_of_week, start_time, end_time, room_name } = req.body;

  if (!home_id || !user_id || day_of_week === undefined || !start_time || !end_time || !room_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO access_permissions (home_id, user_id, day_of_week, start_time, end_time, room_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [home_id, user_id, day_of_week, start_time, end_time, room_name]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error inserting access permission:', err);
    next(err);
  }
});

// PUT - Update an existing access permission by ID
router.put('/:id', async (req, res, next) => {
  const id = req.params.id;
  const { home_id, user_id, day_of_week, start_time, end_time, room_name } = req.body;

  if (!home_id || !user_id || day_of_week === undefined || !start_time || !end_time || !room_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE access_permissions
       SET home_id = ?, user_id = ?, day_of_week = ?, start_time = ?, end_time = ?, room_name = ?
       WHERE id = ?`,
      [home_id, user_id, day_of_week, start_time, end_time, room_name, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Access permission not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating access permission:', err);
    next(err);
  }
});

// GET - Filter rooms allowed for current user right now, with owner check and overnight time support
router.get('/filter', async (req, res, next) => {
  const { home_id, user_id } = req.query;

  if (!home_id || !user_id) {
    return res.status(400).json({ error: 'Missing home_id or user_id' });
  }

  try {
    // Check if user is owner of the home
    const [homeRows] = await pool.query(
      'SELECT owner_id FROM homes WHERE id = ?',
      [home_id]
    );

    if (homeRows.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }

    const ownerId = homeRows[0].owner_id;

    if (ownerId.toString() === user_id.toString()) {
      // Owner: full access to all rooms in this home
      const [allRooms] = await pool.query(
        'SELECT DISTINCT name AS room_name FROM rooms WHERE home_id = ?',
        [home_id]
      );
      return res.json(allRooms);
    }

    // Not owner: check access permissions with time and day filters
    const now = new Date();
    const dayOfWeek = now.getDay(); // Sunday = 0
    const currentTime = now.toTimeString().slice(0, 8); // 'HH:MM:SS'

    // Query with overnight time window handling
    const [rows] = await pool.query(
      `SELECT DISTINCT room_name FROM access_permissions
       WHERE home_id = ?
         AND user_id = ?
         AND day_of_week = ?
         AND (
           (start_time <= end_time AND start_time <= ? AND end_time >= ?)
           OR
           (start_time > end_time AND (start_time <= ? OR end_time >= ?))
         )`,
      [home_id, user_id, dayOfWeek, currentTime, currentTime, currentTime, currentTime]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET - Get access permissions filtered by user_id and home_id (for editing)
router.get('/', async (req, res, next) => {
  const { user_id, home_id } = req.query;

  try {
    let sql = 'SELECT * FROM access_permissions';
    const params = [];

    if (user_id && home_id) {
      sql += ' WHERE user_id = ? AND home_id = ?';
      params.push(user_id, home_id);
    } else if (user_id) {
      sql += ' WHERE user_id = ?';
      params.push(user_id);
    } else if (home_id) {
      sql += ' WHERE home_id = ?';
      params.push(home_id);
    }

    sql += ' ORDER BY day_of_week ASC, start_time ASC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
