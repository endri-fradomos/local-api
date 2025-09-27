import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { body, validationResult } from 'express-validator';
import { sendWelcomeEmail } from "../utils/mailer.js";

// replace static multer import with dynamic import + safe fallback
let upload;
try {
  // top-level await is supported in recent Node ESM runtimes
  const mod = await import('multer');
  const multer = mod.default || mod;
  // multer memory storage for storing image in DB as BLOB
  const storage = multer.memoryStorage();
  const fileFilter = (req, file, cb) => {
    if (file && file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(null, false); // ignore non-images
  };
  upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit
} catch (err) {
  // multer not installed — provide a no-op upload.single so server won't crash
  console.warn('Warning: multer is not installed. Profile image upload disabled. To enable, run: npm install multer');
  upload = {
    single: (/* fieldName */) => (req, res, next) => {
      // ensure req.file exists as undefined (no upload)
      req.file = undefined;
      next();
    }
  };
}

const router = Router();

// =====================
// ✅ REGISTER ROUTE
// =====================
router.post(
  '/register',
  // handle single file named 'profile_image' (optional)
  upload.single('profile_image'),
  [
    body('username').trim().notEmpty(),
    body('password').isLength({ min: 6 }),
    body('email').isEmail(),
    body('name').trim().notEmpty(),
    body('lastname').trim().notEmpty(),
    body('phone_nr').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, password, email, name, lastname, phone_nr } =
      req.body;

    try {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );
      if (existing.length > 0)
        return res.status(400).json({ error: 'User already exists' });

      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        'INSERT INTO users (username, password, email, name, lastname, phone_nr, profile_image) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, hash, email, name, lastname, phone_nr, req.file ? req.file.buffer : null]
      );

      sendWelcomeEmail(email, name);

      res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// =====================
// ✅ LOGIN ROUTE
// =====================
router.post(
  '/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;

    try {
      const [rows] = await pool.query(
        'SELECT id, password FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      // ✅ Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
      );

      res.json({ token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// =====================
// ✅ LOGIN BY ID ROUTE
// Validate email and plain password for given userId
// =====================
router.post(
  '/login-by-id',
  [
    body('userId').isInt(),
    body('email').isEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { userId, email, password } = req.body;

    try {
      // Query user by id
      const [rows] = await pool.query(
        'SELECT id, email, password FROM users WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      const user = rows[0];

      // Check email matches exactly
      if (user.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      // Compare password hash
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
      );

      return res.json({ token });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// =====================
// ✅ GET PROFILE IMAGE ROUTE
// =====================
router.get('/users/:id/profile-image', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT profile_image FROM users WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].profile_image) {
      return res.status(404).json({ msg: 'Profile image not found' });
    }
    const img = rows[0].profile_image;
    // serve raw image; Postman will display/download it
    res.set('Content-Type', 'image/*');
    return res.send(img);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;