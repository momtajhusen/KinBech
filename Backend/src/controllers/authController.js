const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Otp = require('../models/Otp');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Report = require('../models/Report');
const Shop = require('../models/Shop');
const { normalizePhone } = require('../utils/phone');
const { signUserToken, publicUser } = require('../utils/token');
const { ensureReferralCode, applyReferralCode } = require('../utils/referral');
const { computeLiveMetrics, detectAndAlertAnomalies } = require('../utils/platformBI');
const PlatformAlert = require('../models/PlatformAlert');
const Message = require('../models/Message');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');
const ErrorEvent = require('../models/ErrorEvent');
const { haversineDistanceKm } = require('../utils/listing');
const { evaluatePublicText, publicProhibitedBody } = require('../utils/listingModeration');
const { emitActivity } = require('../utils/realtime');
const {
  LIVE_ACTIVITY_TYPES,
  userActivityEvent,
  listingActivityEvent,
  shopActivityEvent,
  reportActivityEvent,
  reviewActivityEvent,
  ticketActivityEvent,
  errorActivityEvent,
  alertActivityEvent,
} = require('../utils/activityEvents');

function otpExpiry() {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 5);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function makeOtp() {
  // DEFAULT_OTP=1111 for easy APK/QA testing; set DEFAULT_OTP=random for real OTPs
  const fixed = String(process.env.DEFAULT_OTP || '1111').trim().toLowerCase();
  if (fixed && fixed !== 'random') {
    return fixed.replace(/\D/g, '').padStart(4, '0').slice(-4);
  }
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

async function issueOtp(phone, purpose, name = '') {
  const code = makeOtp();
  const hashed = await bcrypt.hash(code, 10);

  await Otp.updateMany({ phone, consumed: false }, { consumed: true });
  await Otp.create({
    phone,
    code: hashed,
    purpose,
    name,
    expiresAt: otpExpiry(),
  });

  return code;
}

async function signup(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'Please enter your name to continue' });
    }

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit phone number' });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: 'An account with this number already exists. Please log in instead.' });
    }

    const contentCheck = await evaluatePublicText({ name }, 'profile');
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
    }

    const otp = await issueOtp(phone, 'signup', name);
    const payload = { message: 'Verification code sent successfully', phone };

    if (process.env.NODE_ENV !== 'production') {
      payload.otp = otp;
    }

    return res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit phone number' });
    }

    const user = await User.findOne({ phone });
    
    // Auto-signup: if user doesn't exist, treat as signup without name
    if (!user) {
      const otp = await issueOtp(phone, 'signup', '');
      const payload = { message: 'Verification code sent successfully', phone, isNewUser: true };

      if (process.env.NODE_ENV !== 'production') {
        payload.otp = otp;
      }

      return res.status(201).json(payload);
    }

    const otp = await issueOtp(phone, 'login', user.name);
    const payload = { message: 'Verification code sent successfully', phone, isNewUser: false };

    if (process.env.NODE_ENV !== 'production') {
      payload.otp = otp;
    }

    return res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.otp || req.body.code || '').trim();

    if (!phone || !code) {
      return res.status(400).json({ message: 'Phone number and verification code are required' });
    }

    if (code.length !== 4) {
      return res.status(400).json({ message: 'Please enter the 4-digit verification code' });
    }

    const record = await Otp.findOne({
      phone,
      consumed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({ message: 'This verification code has expired. Please request a new one.' });
    }

    const matches = await bcrypt.compare(code, record.code);
    if (!matches) {
      return res.status(400).json({ message: 'The verification code you entered is incorrect. Please try again.' });
    }

    record.consumed = true;
    await record.save();

    let user = await User.findOne({ phone });
    let isNewUser = false;

    // Auto-create user if this was a signup OTP (without name initially)
    if (!user && record.purpose === 'signup') {
      user = await User.create({
        phone,
        name: '',
        profileComplete: false,
      });
      isNewUser = true;
      await ensureReferralCode(user);
      emitActivity(userActivityEvent(user));
    }

    if (!user) {
      return res.json({
        isNewUser: true,
        phone,
      });
    }

    await ensureReferralCode(user);

    // Optional referral on first OTP verify
    if (isNewUser && req.body.referralCode) {
      await applyReferralCode(user, req.body.referralCode);
    }

    user.lastActiveAt = new Date();
    await user.save();

    const token = signUserToken(user);
    return res.json({
      token,
      user: publicUser(user, { includePrivate: true }),
      isNewUser,
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res) {
  await ensureReferralCode(req.user);
  res.json({ user: publicUser(req.user, { includePrivate: true }) });
}

async function getReferral(req, res, next) {
  try {
    const code = await ensureReferralCode(req.user);
    const invitedCount = await User.countDocuments({ referredBy: req.user._id });
    res.json({
      referralCode: code,
      featuredCredits: Math.max(0, Number(req.user.featuredCredits) || 0),
      invitedCount,
      reward: 'Invite a friend — you get 1 day of featured listing free when they join.',
      shareMessage: `Join KinBech with my code ${code} and start buying & selling nearby. I get a free featured listing boost when you sign up!`,
    });
  } catch (error) {
    next(error);
  }
}

async function applyMyReferral(req, res, next) {
  try {
    const result = await applyReferralCode(req.user, req.body.code || req.body.referralCode);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }
    res.json({
      message: result.message,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function completeSignup(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'Please enter your name to continue' });
    }

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: 'An account with this number already exists. Please log in instead.' });
    }

    const contentCheck = await evaluatePublicText({ name }, 'profile');
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
    }

    const user = await User.create({
      phone,
      name,
    });
    await ensureReferralCode(user);
    if (req.body.referralCode) {
      await applyReferralCode(user, req.body.referralCode);
    }
    emitActivity(userActivityEvent(user));

    const token = signUserToken(user);
    return res.json({
      token,
      user: publicUser(user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    if (req.body.name !== undefined) {
      req.user.name = String(req.body.name).trim();
    }
    if (req.body.bio !== undefined) {
      req.user.bio = String(req.body.bio).trim().slice(0, 200);
    }
    if (req.body.avatarUrl !== undefined) {
      req.user.avatarUrl = String(req.body.avatarUrl).trim();
    }
    if (req.body.location !== undefined) {
      req.user.location = String(req.body.location).trim();
    }
    if (req.body.coordinates !== undefined) {
      req.user.coordinates = {
        latitude: Number(req.body.coordinates.latitude),
        longitude: Number(req.body.coordinates.longitude),
      };
    }
    if (req.body.profileComplete !== undefined) {
      req.user.profileComplete = Boolean(req.body.profileComplete);
    }
    if (req.body.sellerTypePreference !== undefined) {
      req.user.sellerTypePreference = String(req.body.sellerTypePreference);
    }

    if (req.body.name !== undefined || req.body.bio !== undefined) {
      const contentCheck = await evaluatePublicText(
        { name: req.user.name, bio: req.user.bio },
        'profile'
      );
      if (!contentCheck.ok) {
        return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
      }
    }

    await ensureReferralCode(req.user);
    if (req.body.referralCode) {
      await applyReferralCode(req.user, req.body.referralCode);
    }

    await req.user.save();
    const token = signUserToken(req.user);
    return res.json({
      token,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    if (req.body.notifications !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.notifications = Boolean(req.body.notifications);
    }
    if (req.body.language !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.language = String(req.body.language);
    }
    if (req.body.currency !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.currency = String(req.body.currency);
    }
    if (req.body.showPhone !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.showPhone = Boolean(req.body.showPhone);
    }
    if (req.body.showLocation !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.showLocation = Boolean(req.body.showLocation);
    }
    req.user.markModified('preferences');

    await req.user.save();
    const token = signUserToken(req.user);
    return res.json({
      token,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function getBlockedUsers(req, res, next) {
  try {
    const ids = Array.isArray(req.user.blockedUserIds) ? req.user.blockedUserIds : [];
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }, 'name avatarUrl phone')
      : [];
    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email, role: { $in: ['admin', 'super_admin', 'moderator', 'support'] } });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signUserToken(user);
    return res.json({
      token,
      user: publicUser(user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function getAllAdmins(req, res, next) {
  try {
    const filter = { role: { $in: ['admin', 'super_admin', 'moderator', 'support'] } };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, admins] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email role createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const adminsWithAccess = admins.map(admin => ({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      access: admin.role === 'super_admin' ? ['all'] :
              admin.role === 'moderator' ? ['listings', 'reports'] :
              admin.role === 'support' ? ['users', 'tickets'] : [],
      createdAt: admin.createdAt,
    }));

    res.json({
      admins: adminsWithAccess,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

async function createAdmin(req, res, next) {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role || !name) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      email,
      password: hashedPassword,
      name,
      role,
      // Phone is optional for admin accounts
    });

    res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt,
      }
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAdmin(req, res, next) {
  try {
    const { adminId } = req.params;

    if (String(adminId) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot delete super admin' });
    }

    await User.findByIdAndDelete(adminId);

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function getDashboardStats(req, res, next) {
  try {
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const pendingShops = await Shop.countDocuments({ isVerified: false, status: 'active' });

    const live = await computeLiveMetrics();
    let anomalies = [];
    try {
      anomalies = await detectAndAlertAnomalies(live);
    } catch (anomalyErr) {
      console.error('[BI] anomaly check failed', anomalyErr?.message || anomalyErr);
    }

    // Get weekly listing data
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weeklyListings = await Listing.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo },
          status: { $in: ['active', 'sold', 'pending'] },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Convert to day names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = dayNames.map((day, index) => {
      const dayData = weeklyListings.find((d) => d._id === index + 1);
      return { day, listings: dayData ? dayData.count : 0 };
    });

    const pendingReportDocs = await Report.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    const pendingShopDocs = await Shop.find({ isVerified: false, status: 'active' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt')
      .lean();
    const latestListings = await Listing.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title createdAt status')
      .lean();

    const recentActivity = [
      ...anomalies.slice(0, 3).map((a) => ({
        id: `anomaly-${a.id}`,
        type: 'system',
        message: a.title,
        time: a.createdAt,
      })),
      ...pendingReportDocs.map((r) => ({
        id: String(r._id),
        type: 'report',
        message: `New report: ${r.reason || 'user report'}`,
        time: r.createdAt,
      })),
      ...pendingShopDocs.map((s) => ({
        id: String(s._id),
        type: 'verification',
        message: `Shop pending verification: ${s.name}`,
        time: s.createdAt,
      })),
      ...latestListings.map((l) => ({
        id: String(l._id),
        type: 'system',
        message: `Listing ${l.status}: ${l.title}`,
        time: l.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10)
      .map((item) => ({
        ...item,
        time: item.time ? new Date(item.time).toLocaleString() : '',
      }));

    const attentionItems = [
      ...anomalies.slice(0, 5).map((a) => ({
        id: a.id,
        priority: String(a.type).includes('crash') ? 'High' : 'Medium',
        title: a.title,
        description: a.message,
        time: a.createdAt ? new Date(a.createdAt).toLocaleString() : '',
        kind: 'anomaly',
        link: '/admin/dashboard',
      })),
      ...pendingReportDocs.slice(0, 3).map((r) => ({
        id: String(r._id),
        priority: 'High',
        title: 'Pending report',
        description: r.reason || 'A user report needs review',
        time: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
        kind: 'report',
        link: '/admin/reports',
      })),
      ...pendingShopDocs.slice(0, 3).map((s) => ({
        id: String(s._id),
        priority: 'Medium',
        title: 'Shop verification',
        description: `${s.name} is waiting for verification`,
        time: s.createdAt ? new Date(s.createdAt).toLocaleString() : '',
        kind: 'shop',
        link: '/admin/shops',
      })),
    ];

    res.json({
      stats: {
        totalUsers: live.totalUsers,
        activeListings: live.activeListings,
        pendingReports,
        pendingShops,
        dau: live.dau,
        signupsToday: live.signupsToday,
        transactionsToday: live.transactionsToday,
        newListingsToday: live.newListingsToday,
        signupsChangePct: live.signupsChangePct,
        transactionsChangePct: live.transactionsChangePct,
      },
      live,
      topCategories: live.topCategories,
      anomalies,
      weeklyData,
      recentActivity,
      attentionItems,
      refreshedAt: live.generatedAt,
    });
  } catch (error) {
    next(error);
  }
}

async function updatePlatformAlert(req, res, next) {
  try {
    const alert = await PlatformAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    const { status } = req.body;
    if (status && ['open', 'acknowledged', 'resolved'].includes(status)) {
      alert.status = status;
      await alert.save();
    }
    res.json({ alert });
  } catch (error) {
    next(error);
  }
}

async function getAllUsers(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = { role: 'user' };

    if (status === 'suspended') {
      filter.status = 'suspended';
    } else if (status === 'verified') {
      filter.status = { $ne: 'suspended' };
      filter.profileComplete = true;
    } else if (status === 'unverified') {
      filter.status = { $ne: 'suspended' };
      filter.profileComplete = { $ne: true };
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email phone profileComplete soldCount boughtCount createdAt status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Add listing counts
    const userIds = users.map(u => u._id);
    const listingCounts = await Listing.aggregate([
      { $match: { seller: { $in: userIds }, status: 'active' } },
      { $group: { _id: '$seller', count: { $sum: 1 } } }
    ]);

    const listingCountMap = {};
    listingCounts.forEach(item => {
      listingCountMap[item._id.toString()] = item.count;
    });

    const usersWithCounts = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      sellerType: user.soldCount > 0 ? 'individual' : 'buyer',
      joinDate: user.createdAt,
      listingsCount: listingCountMap[user._id.toString()] || 0,
      status: user.status === 'suspended' ? 'suspended' : (user.profileComplete ? 'verified' : 'unverified'),
    }));

    res.json({
      users: usersWithCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { action } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (action === 'suspend') {
      user.status = 'suspended';
    } else if (action === 'reinstate') {
      user.status = 'active';
    }

    await user.save();

    res.json({ 
      message: 'User status updated successfully',
      user: publicUser(user, { includePrivate: true })
    });
  } catch (error) {
    next(error);
  }
}

async function saveDeviceToken(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'token is required' });
    }
    req.user.fcmToken = token;
    await req.user.save();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function pinStore(req, res, next) {
  try {
    const { storeId, storeType } = req.body;

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    if (!storeType || !['shop', 'individual'].includes(storeType)) {
      return res.status(400).json({ message: 'storeType must be shop or individual' });
    }

    // Check if store exists
    if (storeType === 'shop') {
      const shop = await Shop.findOne({ _id: storeId, status: 'active' });
      if (!shop) {
        return res.status(404).json({ message: 'Store not found' });
      }
    } else {
      const user = await User.findOne({ _id: storeId, status: { $ne: 'suspended' } });
      if (!user) {
        return res.status(404).json({ message: 'Seller not found' });
      }
    }

    // Check if already pinned
    const existingPin = req.user.pinnedStores?.find(
      p => String(p.storeId) === String(storeId)
    );

    if (existingPin) {
      return res.json({ ok: true, message: 'Store already pinned' });
    }

    // Add to pinned stores
    if (!req.user.pinnedStores) {
      req.user.pinnedStores = [];
    }

    req.user.pinnedStores.push({
      storeId,
      storeType,
      pinnedAt: new Date(),
    });

    await req.user.save();

    res.json({ ok: true, message: 'Store pinned successfully' });
  } catch (error) {
    next(error);
  }
}

async function unpinStore(req, res, next) {
  try {
    const { storeId } = req.params;

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    if (!req.user.pinnedStores || req.user.pinnedStores.length === 0) {
      return res.json({ ok: true, message: 'No pinned stores' });
    }

    req.user.pinnedStores = req.user.pinnedStores.filter(
      p => String(p.storeId) !== String(storeId)
    );

    await req.user.save();

    res.json({ ok: true, message: 'Store unpinned successfully' });
  } catch (error) {
    next(error);
  }
}

async function getPinnedStores(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;

    const pinnedStoreIds = (req.user.pinnedStores || []).map(p => p.storeId);
    const pinned = [];

    // Fetch shops
    const shopIds = pinnedStoreIds.filter(id => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(id));
      return pin && pin.storeType === 'shop';
    });

    if (shopIds.length > 0) {
      const shops = await Shop.find({ _id: { $in: shopIds }, status: 'active' }).lean();
      for (const shop of shops) {
        const listings = await Listing.find({
          shopId: shop._id,
          status: 'active',
        })
          .select('photos category location coordinates createdAt')
          .limit(10)
          .lean();

        const coords = shop.coordinates || {};
        const distance = userLat != null && userLng != null && coords.lat != null && coords.lng != null
          ? haversineDistanceKm(userLat, userLng, coords.lat, coords.lng)
          : null;

        pinned.push({
          _id: shop._id,
          id: shop._id,
          name: shop.name,
          avatarUrl: shop.logo || '',
          coverImage: shop.coverImage || '',
          tagline: shop.tagline || '',
          rating: Number(shop.ratingAverage) || 0,
          reviewsCount: Number(shop.reviewCount) || 0,
          listingCount: listings.length,
          distance: distance == null ? null : Math.round(distance * 10) / 10,
          location: shop.location || shop.address || '',
          verified: Boolean(shop.isVerified),
          verificationKind: shop.isVerified ? 'business' : null,
          verificationLabel: shop.isVerified ? 'Business Verified' : null,
          productGallery: listings.slice(0, 4).map(l => l.photos?.[0]).filter(Boolean),
          sellerType: 'shop',
          category: shop.category || 'Other',
          shopId: shop._id,
          userId: shop.owner,
          description: shop.description || '',
          phone: shop.phone || '',
          openingHours: shop.openingHours || '',
          coordinates: coords,
        });
      }
    }

    // Fetch individual sellers
    const userIds = pinnedStoreIds.filter(id => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(id));
      return pin && pin.storeType === 'individual';
    });

    if (userIds.length > 0) {
      const users = await User.find({
        _id: { $in: userIds },
        status: { $ne: 'suspended' },
      })
        .select('name avatarUrl location coordinates phone bio')
        .lean();

      for (const user of users) {
        const listings = await Listing.find({
          seller: user._id,
          sellerType: 'individual',
          status: 'active',
        })
          .select('photos category location coordinates createdAt')
          .limit(10)
          .lean();

        const coords = user.coordinates || {};
        const distance = userLat != null && userLng != null && coords.latitude != null && coords.longitude != null
          ? haversineDistanceKm(userLat, userLng, coords.latitude, coords.longitude)
          : null;

        const location = user.preferences?.showLocation === false ? '' : user.location || '';

        pinned.push({
          _id: user._id,
          id: user._id,
          name: user.name || 'Seller',
          avatarUrl: user.avatarUrl || '',
          coverImage: user.avatarUrl || '',
          rating: 0,
          reviewsCount: 0,
          listingCount: listings.length,
          distance: distance == null ? null : Math.round(distance * 10) / 10,
          location,
          verified: Boolean(user.phone),
          verificationKind: user.phone ? 'phone' : null,
          verificationLabel: user.phone ? 'Phone Verified' : null,
          productGallery: listings.slice(0, 4).map(l => l.photos?.[0]).filter(Boolean),
          sellerType: 'individual',
          category: listings[0]?.category || 'General',
          shopId: null,
          userId: user._id,
          description: user.bio || '',
          phone: user.preferences?.showPhone ? user.phone || '' : '',
          coordinates: coords,
        });
      }
    }

    // Sort by pinnedAt (most recent first)
    const pinnedWithTime = pinned.map(store => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(store._id));
      return { ...store, pinnedAt: pin?.pinnedAt };
    });

    pinnedWithTime.sort((a, b) => {
      const aTime = new Date(a.pinnedAt || 0).getTime();
      const bTime = new Date(b.pinnedAt || 0).getTime();
      return bTime - aTime;
    });

    res.json({ stores: pinnedWithTime });
  } catch (error) {
    next(error);
  }
}

const PER_SOURCE_LIMIT = 25;

/**
 * Live platform activity for the admin "Live Activity" page.
 * Returns a live pulse (counters) plus a merged, newest-first event feed
 * built from signups, listings, shops, reports, reviews, tickets, errors and alerts.
 */
async function getLiveActivity(req, res, next) {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const requested = parseInt(req.query.limit, 10) || 40;
    const limit = Math.min(100, Math.max(10, requested));

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [
      onlineNow,
      activeToday,
      signupsToday,
      listingsToday,
      soldToday,
      messagesLastHour,
      errorsLastHour,
      pendingReports,
      pendingShops,
      pendingReviews,
      openTickets,
      openAlerts,
    ] = await Promise.all([
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: fifteenMinAgo } }),
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: startOfDay } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: startOfDay } }),
      Listing.countDocuments({ createdAt: { $gte: startOfDay } }),
      Listing.countDocuments({ status: 'sold', updatedAt: { $gte: startOfDay } }),
      Message.countDocuments({ createdAt: { $gte: hourAgo } }),
      ErrorEvent.countDocuments({ createdAt: { $gte: hourAgo }, severity: { $in: ['error', 'fatal'] } }),
      Report.countDocuments({ status: 'pending' }),
      Shop.countDocuments({ isVerified: false, status: 'active' }),
      Review.countDocuments({ status: 'pending' }),
      SupportTicket.countDocuments({ status: 'open' }),
      PlatformAlert.countDocuments({ status: 'open' }),
    ]);

    const [userDocs, listingDocs, shopDocs, reportDocs, reviewDocs, ticketDocs, errorDocs, alertDocs] =
      await Promise.all([
        User.find({ role: 'user' })
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name phone location profileComplete createdAt')
          .lean(),
        Listing.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('title category price status sellerType seller shopId createdAt')
          .lean(),
        Shop.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name owner isVerified status category location createdAt')
          .lean(),
        Report.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('reporter reportedUser reportedListing reason details status createdAt')
          .lean(),
        Review.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('reviewer shopId listing rating review tags status createdAt')
          .lean(),
        SupportTicket.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('user name phone subject message status createdAt')
          .lean(),
        ErrorEvent.find({ status: { $in: ['open', 'acknowledged'] } })
          .sort({ lastSeenAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name message source path severity status statusCode occurrenceCount userLabel lastSeenAt createdAt')
          .lean(),
        PlatformAlert.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('type title message metricValue baselineValue changePct status createdAt')
          .lean(),
      ]);

    const events = [
      ...userDocs.map(userActivityEvent),
      ...listingDocs.map(listingActivityEvent),
      ...shopDocs.map(shopActivityEvent),
      ...reportDocs.map(reportActivityEvent),
      ...reviewDocs.map(reviewActivityEvent),
      ...ticketDocs.map(ticketActivityEvent),
      ...errorDocs.map(errorActivityEvent),
      ...alertDocs.map(alertActivityEvent),
    ];

    const actorIds = [...new Set(events.map((e) => e.actorId).filter(Boolean).map(String))];
    if (actorIds.length) {
      const actors = await User.find({ _id: { $in: actorIds } })
        .select('name phone')
        .lean();
      const nameById = new Map(actors.map((a) => [String(a._id), a.name || a.phone || 'User']));
      events.forEach((e) => {
        if (e.actorId) e.actor = nameById.get(String(e.actorId)) || e.actor || 'User';
        delete e.actorId;
      });
    }

    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const counts = { all: events.length };
    LIVE_ACTIVITY_TYPES.forEach((t) => {
      counts[t] = events.filter((e) => e.type === t).length;
    });

    const filtered = type === 'all' ? events : events.filter((e) => e.type === type);

    res.json({
      pulse: {
        onlineNow,
        activeToday,
        signupsToday,
        listingsToday,
        soldToday,
        messagesLastHour,
        errorsLastHour,
        pendingReports,
        pendingShops,
        pendingReviews,
        openTickets,
        openAlerts,
      },
      events: filtered.slice(0, limit),
      counts,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  verifyOtp,
  me,
  updateMe,
  saveDeviceToken,
  completeSignup,
  updatePreferences,
  getBlockedUsers,
  getReferral,
  applyMyReferral,
  adminLogin,
  getAllAdmins,
  createAdmin,
  deleteAdmin,
  getDashboardStats,
  updatePlatformAlert,
  getAllUsers,
  updateUserStatus,
  getLiveActivity,
  pinStore,
  unpinStore,
  getPinnedStores,
};
