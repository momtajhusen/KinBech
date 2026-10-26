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
  setDealOutcome,
} = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');
const { chatMessageLimiter } = require('../middleware/security');

const router = Router();

router.use(requireAuth);
router.get('/', getChats);
router.get('/incoming-call', getIncomingCall);
router.post('/', chatMessageLimiter, createChat);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', chatMessageLimiter, sendMessage);
router.patch('/:id/messages/:messageId', editMessage);
router.post('/:id/messages/:messageId/delete', deleteMessage);
router.post('/:id/typing', setTyping);
router.post('/:id/meetup', confirmMeetup);
router.post('/:id/deal', setDealOutcome);
router.post('/:id/call', createCall);
router.get('/:id/call', getCallStatus);
router.post('/:id/call/delivered', markCallDelivered);
router.post('/:id/call/end', endCall);

module.exports = router;
