import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// =====================
// ✅ REGISTER ROUTE
// =====================
router.post(
  '/register',
  [
    body('username').trim().notEmpty(),
    body('password').isLength({ min: 6 }),
    body('email').isEmail(),
    body('first_name').trim().notEmpty(),
    body('last_name').trim().notEmpty(),
    body('phone_number').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, password, email, first_name, last_name, phone_number } =
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
        'INSERT INTO users (username, password_hash, email, first_name, last_name, phone_number) VALUES (?, ?, ?, ?, ?, ?)',
        [username, hash, email, first_name, last_name, phone_number]
      );

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
        'SELECT id, password_hash FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ msg: 'Invalid credentials' });
      }

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

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
        'SELECT id, email, password_hash FROM users WHERE id = ?',
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
      const match = await bcrypt.compare(password, user.password_hash);
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

export default router;