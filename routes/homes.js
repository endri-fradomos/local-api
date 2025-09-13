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

    // 1. Get homes where the user is the owner
    const [ownedHomes] = await pool.query(
      'SELECT *, false AS shared FROM homes WHERE owner_id = ?',
      [userId]
    );

    // 2. Get home IDs where the user is a member (not owner)
    const [memberRows] = await pool.query(
      'SELECT home_id FROM home_members WHERE user_id = ?',
      [userId]
    );
    const memberHomeIds = memberRows.map(row => row.home_id);

    let sharedHomes = [];
    if (memberHomeIds.length > 0) {
      const placeholders = memberHomeIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT *, true AS shared FROM homes WHERE id IN (${placeholders}) AND owner_id != ?`,
        [...memberHomeIds, userId] // prevents showing owned homes again
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
      'INSERT INTO homes (name, owner_id) VALUES (?, ?)',
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
      'UPDATE homes SET name = ? WHERE id = ? AND owner_id = ?',
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
      'DELETE FROM homes WHERE id = ? AND owner_id = ?',
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