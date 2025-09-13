import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import roomsRouter from './routes/rooms.js';
import homesRouter from './routes/homes.js';
import homeMembersRouter from './routes/homeMembers.js';
import homeInvitesRouter from './routes/homeInvites.js';
import devicesRouter from './routes/devices.js';
import accessPermissionsRouter from './routes/accessPermissions.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(bodyParser.json());

// ✅ Register all routes
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/rooms', roomsRouter);
app.use('/homes', homesRouter);
app.use('/home-members', homeMembersRouter);
app.use('/home-invites', homeInvitesRouter);
app.use('/devices', devicesRouter);
app.use('/access-permissions', accessPermissionsRouter);


app.get('/', (req, res) => {
  res.send('API running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
