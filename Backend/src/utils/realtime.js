const User = require('../models/User');

const ADMIN_ROLES = ['admin', 'super_admin', 'moderator', 'support'];
const ADMIN_ROOM = 'admins';

let io = null;

/** Verify the admin JWT sent in the Socket.IO handshake. */
async function authenticateSocket(socket, next) {
  try {
    const handshake = socket.handshake.auth || {};
    const header = socket.handshake.headers?.authorization || '';
    const token = handshake.token || (header.startsWith('Bearer ') ? header.slice(7) : '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Lazy require: middleware/auth pulls in models that require this module.
    // eslint-disable-next-line global-require
    const { resolveSession } = require('../middleware/auth');
    const session = await resolveSession(token);
    if (!session.user || session.scope) {
      return next(new Error(session.body?.message || 'Invalid or expired token'));
    }

    const { user } = session;
    if (!ADMIN_ROLES.includes(user.role) || user.status === 'suspended' || user.mustChangePassword) {
      return next(new Error('Admin access required'));
    }

    socket.data.adminId = String(user._id);
    socket.data.adminName = user.name || 'Admin';
    return next();
  } catch (_error) {
    return next(new Error('Invalid or expired token'));
  }
}

/** Attach Socket.IO to the shared HTTP server. Safe to call once. */
function initRealtime(httpServer) {
  if (io) return io;

  // Lazy require so environments without socket.io still boot the REST API.
  // eslint-disable-next-line global-require
  const { Server } = require('socket.io');

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        // eslint-disable-next-line global-require
        callback(null, require('../middleware/security').isAllowedOrigin(origin));
      },
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.join(ADMIN_ROOM);
    socket.emit('realtime:ready', {
      admin: socket.data.adminName,
      connectedAt: new Date().toISOString(),
    });

    socket.on('disconnect', () => {
      /* room membership is cleaned up automatically */
    });
  });

  console.log('⚡ Realtime (Socket.IO) attached for admin live activity');
  return io;
}

function getIo() {
  return io;
}

/**
 * Fire-and-forget broadcast of one activity event to connected admins.
 * Resolves the actor id to a display name; never throws into callers.
 */
async function emitActivity(event) {
  if (!io || !event) return;
  try {
    const payload = { ...event };
    if (payload.actorId) {
      const actor = await User.findById(payload.actorId).select('name phone').lean();
      if (actor) payload.actor = actor.name || actor.phone || payload.actor;
      delete payload.actorId;
    }
    io.to(ADMIN_ROOM).emit('activity:new', payload);
  } catch (_error) {
    /* realtime failures must never break the request flow */
  }
}

/** Broadcast a refreshed pulse (counters) snapshot to connected admins. */
function emitPulse(pulse) {
  if (!io || !pulse) return;
  io.to(ADMIN_ROOM).emit('pulse:update', pulse);
}

module.exports = {
  initRealtime,
  getIo,
  emitActivity,
  emitPulse,
  ADMIN_ROOM,
};
