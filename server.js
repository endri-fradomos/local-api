// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';

// Import your route files (you'll need to create these similarly)
import usersRouter from './routes/users.js';
import homesRouter from './routes/homes.js';
import homeMembersRouter from './routes/homeMembers.js';
import homeInvitesRouter from './routes/homeInvites.js';
import roomsRouter from './routes/rooms.js';
import devicesRouter from './routes/devices.js';

import authRouter from './routes/auth.js';            // <-- Login route
import { requireAuth } from './middleware/auth.js';   // <-- JWT auth middleware

dotenv.config();

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Public routes
app.use('/auth', authRouter);  // <-- This gives POST /auth/login

// Protected routes (all require JWT token)
app.use('/users', requireAuth, usersRouter);
app.use('/homes', requireAuth, homesRouter);
app.use('/home-members', requireAuth, homeMembersRouter);
app.use('/home-invites', requireAuth, homeInvitesRouter);
app.use('/rooms', requireAuth, roomsRouter);
app.use('/devices', requireAuth, devicesRouter);

app.get('/', (req, res) => {
  res.send('Fradomos API is running 🏠');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API listening on port ${PORT}`);
});
