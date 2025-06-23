// hashPasswords.js
import bcrypt from 'bcrypt';
import pool from './db.js';

async function migrate() {
  // 1) Get all users with their (current plain-text) "password_hash" values
  const [users] = await pool.query('SELECT id, password_hash FROM users');

  for (const { id, password_hash: plain } of users) {
    // 2) Hash the plain‐text password
    const hash = await bcrypt.hash(plain, 10);
    // 3) Update the row to store the bcrypt hash
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, id]
    );
    console.log(`User ${id} migrated.`);
  }

  console.log('All passwords migrated to bcrypt hashes.');
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
