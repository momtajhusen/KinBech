const { Router } = require('express');
const {
  getChats,
  createChat,
  getMessages,
  sendMessage,
  confirmMeetup,
} = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);
router.get('/', getChats);
router.post('/', createChat);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.post('/:id/meetup', confirmMeetup);

module.exports = router;
