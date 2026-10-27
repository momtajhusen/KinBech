const User = require('../models/User');

function sameId(a, b) {
  return String(a?._id || a || '') === String(b?._id || b || '');
}

/** What `user` has blocked from `otherId`: { messages, calls }. */
function blockOf(user, otherId) {
  const entry = (user?.blocks || []).find((block) => sameId(block.user, otherId));
  if (entry) return { messages: Boolean(entry.messages), calls: Boolean(entry.calls) };
  const legacy = (user?.blockedUserIds || []).some((id) => sameId(id, otherId));
  return { messages: legacy, calls: legacy };
}

/** `mine` = what I blocked from them, `theirs` = what they blocked from me. */
async function blockStatus(me, otherId) {
  const id = otherId?._id || otherId;
  const other = id ? await User.findById(id).select('name blocks blockedUserIds').lean() : null;
  return { mine: blockOf(me, otherId), theirs: blockOf(other, me?._id), name: other?.name || '' };
}

function blockedUserIdsOf(user) {
  const ids = new Map();
  (user?.blockedUserIds || []).forEach((id) => ids.set(String(id), id));
  (user?.blocks || []).forEach((block) => {
    if (block.messages || block.calls) ids.set(String(block.user), block.user);
  });
  return [...ids.values()];
}

/** Replaces my block on `otherId`; both flags false means unblock. */
async function setBlock(meId, otherId, { messages, calls }) {
  await User.updateOne({ _id: meId }, { $pull: { blocks: { user: otherId }, blockedUserIds: otherId } });
  if (messages || calls) {
    await User.updateOne(
      { _id: meId },
      { $push: { blocks: { user: otherId, messages: Boolean(messages), calls: Boolean(calls), at: new Date() } } }
    );
    return;
  }
  // Old blocks were mirrored onto the other person; drop that mirror so it cannot outlive the unblock.
  await User.updateOne(
    { _id: otherId, 'blocks.user': { $ne: meId } },
    { $pull: { blockedUserIds: meId } }
  );
}

function messageBlockError(status) {
  if (status.mine.messages) {
    return { code: 'YOU_BLOCKED_MESSAGES', message: 'You blocked messages from this person. Unblock them to send a message.' };
  }
  if (status.theirs.messages) {
    return {
      code: 'MESSAGES_BLOCKED',
      message: `${status.name || 'This person'} has blocked messages from you. Your message was not sent.`,
    };
  }
  return null;
}

function callBlockError(status) {
  if (status.mine.calls) {
    return { code: 'YOU_BLOCKED_CALLS', message: 'You blocked calls from this person. Unblock calls to ring them.' };
  }
  if (status.theirs.calls) {
    return {
      code: 'CALLS_BLOCKED',
      message: `${status.name || 'This person'} has blocked calls from you. Your call cannot ring.`,
    };
  }
  return null;
}

module.exports = {
  blockOf,
  blockStatus,
  blockedUserIdsOf,
  setBlock,
  messageBlockError,
  callBlockError,
};
