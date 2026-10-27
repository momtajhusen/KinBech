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
  reportCallFailure,
  getIncomingCall,
  getCallStatus,
  markCallDelivered,
  endCall,
  setDealOutcome,
} = require('../controllers/chatController');
const {
  listContacts,
  getFeed,
  getContact,
  sendSupportMessage,
  notifyUser,
  callUser,
} = require('../controllers/adminContactController');
const { requireAuth, requireScope } = require('../middleware/auth');
const { chatMessageLimiter } = require('../middleware/security');
const { auditRoute } = require('../utils/audit');

const router = Router();

// Admin contact center: check and reach one user by message, notification or call.
const contactScope = requireScope('users');
router.get('/admin/contacts', contactScope, listContacts);
router.get('/admin/feed', contactScope, getFeed);
router.get('/admin/users/:userId', contactScope, getContact);
router.post('/admin/users/:userId/messages', contactScope, auditRoute('contact.message', { targetType: 'user', param: 'userId' }), sendSupportMessage);
router.post('/admin/users/:userId/notify', contactScope, auditRoute('contact.notify', { targetType: 'user', param: 'userId' }), notifyUser);
router.post('/admin/users/:userId/call', contactScope, auditRoute('contact.call', { targetType: 'user', param: 'userId' }), callUser);

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
router.post('/:id/call/failure', reportCallFailure);
router.get('/:id/call', getCallStatus);
router.post('/:id/call/delivered', markCallDelivered);
router.post('/:id/call/end', endCall);

module.exports = router;
