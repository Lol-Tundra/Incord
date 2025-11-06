// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// In-memory stores (for demo). Replace with DB for production.
const users = {};        // socketId -> {id, name}
const rooms = {          // roomName -> {name, messages: [{from, text, ts}]}
  "general": { name: "general", messages: [] },
  "random": { name: "random", messages: [] }
};

// Helper for private room id between two user ids
function directRoomId(a, b) {
  return [a, b].sort().join('#');
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // Set username (client sends desired name)
  socket.on('set_username', (name, cb) => {
    const id = socket.id;
    users[id] = { id, name };
    // send back current state
    cb({ id, name, rooms: Object.keys(rooms) });
    // broadcast users list update
    io.emit('users', Object.values(users).map(u => ({id: u.id, name: u.name})));
  });

  socket.on('get_rooms', (cb) => {
    cb(Object.keys(rooms));
  });

  socket.on('create_room', (roomName, cb) => {
    if (!roomName) return cb({ ok:false, error: 'no name' });
    if (!rooms[roomName]) {
      rooms[roomName] = { name: roomName, messages: [] };
      io.emit('rooms', Object.keys(rooms));
    }
    cb({ ok:true, room: roomName });
  });

  // join a room (public or private)
  socket.on('join_room', async (roomName, cb) => {
    socket.join(roomName);
    cb({ ok:true, room: roomName, messages: rooms[roomName] ? rooms[roomName].messages : [] });
  });

  // send message to a room
  socket.on('send_message', (payload, cb) => {
    // payload: { room, text }
    const fromUser = users[socket.id] ? users[socket.id].name : 'Unknown';
    const msg = { fromId: socket.id, from: fromUser, text: payload.text, ts: Date.now() };

    // ensure room exists (for DMs we might not store in rooms by default)
    if (!rooms[payload.room]) rooms[payload.room] = { name: payload.room, messages: [] };
    rooms[payload.room].messages.push(msg);

    io.to(payload.room).emit('message', { room: payload.room, message: msg });
    cb({ ok:true });
  });

  // create or open a direct message between two user socket-ids
  socket.on('create_dm', (targetSocketId, cb) => {
    if (!users[targetSocketId]) return cb({ ok:false, error: 'target not found' });
    const room = directRoomId(socket.id, targetSocketId);
    if (!rooms[room]) rooms[room] = { name: room, messages: [] };
    // Join both sockets (if other connected, server will have them join)
    socket.join(room);
    // If target is connected, ask them to join their side too by emitting
    io.to(targetSocketId).emit('invite_dm', { room, from: users[socket.id] || {id: socket.id, name:'Unknown'} });
    cb({ ok:true, room });
  });

  // invite handler: join DM when requested by invited client
  socket.on('join_dm', (room, cb) => {
    socket.join(room);
    cb({ ok:true, room, messages: rooms[room] ? rooms[room].messages : [] });
  });

  // send direct message (same as send_message but keep it explicit)
  socket.on('send_dm', (payload, cb) => {
    // payload: { toSocketId, text }
    const room = directRoomId(socket.id, payload.toSocketId);
    const fromUser = users[socket.id] ? users[socket.id].name : 'Unknown';
    const msg = { fromId: socket.id, from: fromUser, text: payload.text, ts: Date.now() };

    if (!rooms[room]) rooms[room] = { name: room, messages: [] };
    rooms[room].messages.push(msg);

    io.to(room).emit('message', { room, message: msg });
    cb({ ok:true });
  });

  // send initial lists on request
  socket.on('request_init', (cb) => {
    cb({
      users: Object.values(users).map(u => ({id: u.id, name: u.name})),
      rooms: Object.keys(rooms)
    });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete users[socket.id];
    io.emit('users', Object.values(users).map(u => ({id: u.id, name: u.name})));
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
