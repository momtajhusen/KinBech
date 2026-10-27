const express = require('express');
const { requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const {
  addCallAccount,
  callAdminOverview,
  clearCallAccountBlock,
  replaceCallCredentials,
  setCallSettings,
  updateCallAccounts,
} = require('../utils/callSettings');

const router = express.Router();
const adminOnly = requireScope('settings');

function handle(fn, status = 200) {
  return async (req, res, next) => {
    try {
      await fn(req);
      res.status(status).json(await callAdminOverview());
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  };
}

router.get('/admin/accounts', adminOnly, handle(async () => {}));

router.put(
  '/admin/settings',
  adminOnly,
  auditRoute('calls.settings.update', { targetType: 'calls' }),
  handle((req) => setCallSettings({
    autoSwitch: req.body?.autoSwitch,
    dailyUserMinutes: req.body?.dailyUserMinutes,
  }))
);

router.post(
  '/admin/accounts',
  adminOnly,
  auditRoute('calls.accounts.create', { targetType: 'calls' }),
  handle((req) => addCallAccount({
    label: req.body?.label,
    appId: req.body?.appId,
    appCertificate: req.body?.appCertificate,
    monthlyLimitMinutes: req.body?.monthlyLimitMinutes,
  }), 201)
);

router.put(
  '/admin/accounts',
  adminOnly,
  auditRoute('calls.accounts.update', { targetType: 'calls' }),
  handle((req) => updateCallAccounts(req.body?.accounts))
);

router.put(
  '/admin/accounts/:id/credentials',
  adminOnly,
  auditRoute('calls.accounts.credentials.update', { targetType: 'calls', param: 'id' }),
  handle((req) => replaceCallCredentials(req.params.id, {
    appId: req.body?.appId,
    appCertificate: req.body?.appCertificate,
  }))
);

router.post(
  '/admin/accounts/:id/clear-limit',
  adminOnly,
  auditRoute('calls.accounts.clear-limit.create', { targetType: 'calls', param: 'id' }),
  handle((req) => clearCallAccountBlock(req.params.id, { resetUsage: req.body?.resetUsage === true }))
);

module.exports = router;
