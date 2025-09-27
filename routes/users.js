import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db.js';
import { sendWelcomeEmail } from "../utils/mailer.js";

// dynamic multer import with safe fallback (prevents crash if multer not installed)
let upload;
try {
  const mod = await import('multer');
  const multer = mod.default || mod;
  const storage = multer.memoryStorage();
  const fileFilter = (req, file, cb) => {
    if (file && file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(null, false);
  };
  upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
} catch (e) {
  console.warn('Warning: multer not installed — profile image upload endpoints will be no-ops. To enable, run: npm install multer');
  upload = { single: () => (req, _res, next) => { req.file = undefined; next(); } };
}

const router = Router();

// GET /users
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, name, lastname, email, phone_nr, role, created_at FROM users'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, name, lastname, email, phone_nr, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// NEW: GET /users/:id/profile-image — return raw profile image blob
router.get('/:id/profile-image', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT profile_image FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length || !rows[0].profile_image) {
      return res.status(404).json({ error: 'Profile image not found' });
    }
    const img = rows[0].profile_image;
    res.set('Content-Type', 'image/*');
    return res.send(img);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { username, password, name, lastname, email, phone_nr, role } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password, name, lastname, email, phone_nr, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, hashed, name, lastname, email, phone_nr || null, role || null]
    );


    // send welcome email if available
    try { sendWelcomeEmail(email, name); } catch (e) { /* noop */ }

    res.status(201).json({ id: result.insertId, message: "User created and email script triggered!" });
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id
router.put('/:id', async (req, res, next) => {
  const { name, lastname, email, phone_nr, role } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE users SET name = ?, lastname = ?, email = ?, phone_nr = ?, role = ? WHERE id = ?',
      [name, lastname, email, phone_nr, role || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User updated' });
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id/profile-image — upload or replace profile image
router.put('/:id/profile-image', upload.single('profile_image'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image file uploaded under "profile_image"' });
    }
    const [result] = await pool.query(
      'UPDATE users SET profile_image = ? WHERE id = ?',
      [req.file.buffer, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Profile image updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id/profile-image — remove profile image
router.delete('/:id/profile-image', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'UPDATE users SET profile_image = NULL WHERE id = ?',
      [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Profile image deleted' });
  } catch (err) {
    next(err);
  }
});

// NEW: PATCH /users/:id/role — update only the user's role
router.patch('/:id/role', async (req, res, next) => {
  const { role } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'role is required' });
  }
  try {
    const [result] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User role updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;