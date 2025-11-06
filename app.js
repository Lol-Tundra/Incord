// app.js - client
const socket = io();
let currentRoom = 'general';
let my = { id: null, name: null };

const roomsListEl = document.getElementById('roomsList');
const usersListEl = document.getElementById('usersList');
const messagesEl = document.getElementById('messages');
const channelTitleEl = document.getElementById('channelTitle');
const usernameDisplay = document.getElementById('usernameDisplay');

const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const createRoomBtn = document.getElementById('createRoomBtn');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalInput = document.getElementById('modalInput');
const modalCancel = document.getElementById('modalCancel');
const modalOk = document.getElementById('modalOk');

function openModal(title, placeholder, cb) {
  modalTitle.textContent = title;
  modalInput.value = '';
  modalInput.placeholder = placeholder || '';
  modal.classList.remove('hidden');
  modalOk.onclick = () => {
    modal.classList.add('hidden');
    cb(modalInput.value);
  };
  modalCancel.onclick = () => {
    modal.classList.add('hidden');
  };
}

function promptForName() {
  openModal('Choose your username', 'e.g. alice', (name) => {
    name = name.trim() || ('User' + Math.floor(Math.random()*1000));
    socket.emit('set_username', name, (resp) => {
      my = resp;
      usernameDisplay.textContent = resp.name;
      loadInitial();
      joinRoom('general');
    });
  });
}

// initial connection
socket.on('connect', () => {
  if (!my || !my.name) promptForName();
});

// update users list
socket.on('users', (list) => {
  renderUsers(list);
});

// receive rooms list
socket.on('rooms', (list) => {
  renderRooms(list);
});

// invited to dm
socket.on('invite_dm', ({room, from}) => {
  // auto join the dm room
  socket.emit('join_dm', room, (res) => {
    if (res && res.messages) {
      renderRooms(Object.keys(window._roomsCache || {}).concat([room]));
      loadMessages(room, res.messages);
      setActiveRoom(room);
    }
  });
});

// messages
socket.on('message', ({room, message}) => {
  // if current room, append; else show unread marker (simple)
  if (room === currentRoom) {
    appendMessage(message);
  } else {
    // find room button and add dot
    const btn = document.querySelector(`[data-room="${room}"]`);
    if (btn && !btn.classList.contains('has-unread')) btn.classList.add('has-unread');
  }
});

function loadInitial(){
  socket.emit('request_init', (resp) => {
    window._roomsCache = {};
    resp.rooms.forEach(r => window._roomsCache[r] = { name: r, messages: [] });
    renderRooms(resp.rooms);
    renderUsers(resp.users);
  });
}

function renderRooms(list){
  roomsListEl.innerHTML = '';
  list.forEach(r => {
    const d = document.createElement('div');
    d.className = 'room-btn' + (r === currentRoom ? ' active' : '');
    d.dataset.room = r;
    d.textContent = r[0].toUpperCase();
    d.title = r;
    d.onclick = () => {
      joinRoom(r);
    };
    roomsListEl.appendChild(d);
  });
}

function renderUsers(list){
  usersListEl.innerHTML = '';
  list.forEach(u => {
    const row = document.createElement('div');
    row.className = 'user-card';
    row.innerHTML = `<div>${u.name}</div>`;
    // allow DM when clicking user (but don't DM yourself)
    if (u.id !== my.id) {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = 'DM';
      btn.onclick = (e) => {
        e.stopPropagation();
        socket.emit('create_dm', u.id, (res) => {
          if (res.ok) joinRoom(res.room);
        });
      };
      row.appendChild(btn);
    } else {
      const you = document.createElement('span');
      you.style.opacity = '0.6';
      you.textContent = 'You';
      row.appendChild(you);
    }
    usersListEl.appendChild(row);
  });
}

function joinRoom(room){
  socket.emit('join_room', room, (res) => {
    currentRoom = room;
    setActiveRoom(room);
    channelTitleEl.textContent = room.startsWith(socket.id) ? 'Direct message' : '# ' + room;
    messageInput.placeholder = `Message ${room}`;
    messagesEl.innerHTML = '';
    if (res && res.messages) {
      loadMessages(room, res.messages);
    }
  });
}

function setActiveRoom(room){
  document.querySelectorAll('.room-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.room === room);
    if (b.dataset.room === room) b.classList.remove('has-unread');
  });
}

function loadMessages(room, arr){
  arr.forEach(m => appendMessage(m));
  // keep a cache
  window._roomsCache = window._roomsCache || {};
  window._roomsCache[room] = { name: room, messages: arr };
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage(m){
  const el = document.createElement('div');
  el.className = 'message';
  const date = new Date(m.ts);
  el.innerHTML = `<div class="meta"><strong>${m.from}</strong> · ${date.toLocaleTimeString()}</div><div class="text">${escapeHtml(m.text)}</div>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(unsafe) {
  return unsafe
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

// send message
sendBtn.onclick = () => {
  const text = messageInput.value.trim();
  if (!text) return;
  // detect if currentRoom is a DM room (contains '#') or public - both work the same
  socket.emit('send_message', { room: currentRoom, text }, (res) => {
    messageInput.value = '';
  });
};

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

// create room
createRoomBtn.onclick = () => {
  openModal('Create room', 'room-name', (val) => {
    val = val.trim();
    if (!val) return;
    socket.emit('create_room', val, (res) => {
      if (res.ok) renderRooms(Object.keys(window._roomsCache || {}).concat([res.room]));
      // auto join
      joinRoom(res.room);
    });
  });
};
