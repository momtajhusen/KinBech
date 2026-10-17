const { Router } = require('express');
const {
  getChats,
  createChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  setTyping,
  confirmMeetup,
  createCall,
  getIncomingCall,
  getCallStatus,
  markCallDelivered,
  endCall,
} = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);
router.get('/', getChats);
router.get('/incoming-call', getIncomingCall);
router.post('/', createChat);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.patch('/:id/messages/:messageId', editMessage);
router.post('/:id/messages/:messageId/delete', deleteMessage);
router.post('/:id/typing', setTyping);
router.post('/:id/meetup', confirmMeetup);
router.post('/:id/call', createCall);
router.get('/:id/call', getCallStatus);
router.post('/:id/call/delivered', markCallDelivered);
router.post('/:id/call/end', endCall);

module.exports = router;
