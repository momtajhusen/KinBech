const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const SupportTicket = require('../models/SupportTicket');
const { listingPayload } = require('../utils/listing');

function mapAddress(doc) {
  return {
    id: String(doc._id),
    label: doc.label || 'Home',
    line1: doc.line1 || '',
    city: doc.city || '',
    isDefault: Boolean(doc.isDefault),
  };
}

function mapPayment(doc) {
  return {
    id: String(doc._id),
    provider: doc.provider || 'cash',
    label: doc.label || '',
    identifier: doc.identifier || '',
    isDefault: Boolean(doc.isDefault),
  };
}

async function getAddresses(req, res, next) {
  try {
    res.json({ addresses: (req.user.addresses || []).map(mapAddress) });
  } catch (error) {
    next(error);
  }
}

async function createAddress(req, res, next) {
  try {
    const label = String(req.body.label || 'Home').trim() || 'Home';
    const line1 = String(req.body.line1 || '').trim();
    const city = String(req.body.city || req.user.location || '').trim();
    if (!line1) {
      return res.status(400).json({ message: 'Address line is required' });
    }
    if (!Array.isArray(req.user.addresses)) req.user.addresses = [];
    const isDefault = Boolean(req.body.isDefault) || req.user.addresses.length === 0;
    if (isDefault) {
      req.user.addresses.forEach((a) => {
        a.isDefault = false;
      });
    }
    req.user.addresses.push({ label, line1, city, isDefault });
    await req.user.save();
    res.status(201).json({ addresses: req.user.addresses.map(mapAddress) });
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    if (!req.user.addresses || typeof req.user.addresses.id !== 'function') {
      return res.status(404).json({ message: 'Address not found' });
    }
    const address = req.user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }
    if (req.body.label !== undefined) address.label = String(req.body.label).trim();
    if (req.body.line1 !== undefined) address.line1 = String(req.body.line1).trim();
    if (req.body.city !== undefined) address.city = String(req.body.city).trim();
    if (req.body.isDefault) {
      req.user.addresses.forEach((a) => {
        a.isDefault = String(a._id) === String(address._id);
      });
    }
    await req.user.save();
    res.json({ addresses: req.user.addresses.map(mapAddress) });
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    if (!req.user.addresses || typeof req.user.addresses.id !== 'function') {
      return res.status(404).json({ message: 'Address not found' });
    }
    const address = req.user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }
    address.deleteOne();
    await req.user.save();
    res.json({ addresses: req.user.addresses.map(mapAddress) });
  } catch (error) {
    next(error);
  }
}

async function getPaymentMethods(req, res, next) {
  try {
    res.json({ paymentMethods: (req.user.paymentMethods || []).map(mapPayment) });
  } catch (error) {
    next(error);
  }
}

async function createPaymentMethod(req, res, next) {
  try {
    const provider = String(req.body.provider || 'cash');
    const allowed = ['cash', 'esewa', 'khalti', 'ime', 'bank'];
    if (!allowed.includes(provider)) {
      return res.status(400).json({ message: 'Unsupported payment method' });
    }
    const label = String(req.body.label || provider).trim();
    const identifier = String(req.body.identifier || '').trim();
    if (provider !== 'cash' && !identifier) {
      return res.status(400).json({ message: 'Account ID / number is required' });
    }
    if (!Array.isArray(req.user.paymentMethods)) req.user.paymentMethods = [];
    const isDefault = Boolean(req.body.isDefault) || req.user.paymentMethods.length === 0;
    if (isDefault) {
      (req.user.paymentMethods || []).forEach((m) => {
        m.isDefault = false;
      });
    }
    req.user.paymentMethods.push({ provider, label, identifier, isDefault });
    await req.user.save();
    res.status(201).json({ paymentMethods: req.user.paymentMethods.map(mapPayment) });
  } catch (error) {
    next(error);
  }
}

async function deletePaymentMethod(req, res, next) {
  try {
    if (!req.user.paymentMethods || typeof req.user.paymentMethods.id !== 'function') {
      return res.status(404).json({ message: 'Payment method not found' });
    }
    const method = req.user.paymentMethods.id(req.params.id);
    if (!method) {
      return res.status(404).json({ message: 'Payment method not found' });
    }
    method.deleteOne();
    await req.user.save();
    res.json({ paymentMethods: req.user.paymentMethods.map(mapPayment) });
  } catch (error) {
    next(error);
  }
}

async function getWallet(req, res, next) {
  try {
    const sold = await Listing.find({ seller: req.user._id, status: 'sold' })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const chats = await Chat.find({ participants: req.user._id })
      .populate('listing')
      .sort({ lastMessageAt: -1 })
      .lean();

    const purchases = [];
    const seen = new Set();
    for (const chat of chats) {
      const listing = chat.listing;
      if (!listing) continue;
      const id = String(listing._id);
      if (seen.has(id)) continue;
      if (String(listing.seller) === String(req.user._id)) continue;
      if (listing.status !== 'sold' && !chat.meetupConfirmed) continue;
      seen.add(id);
      purchases.push(listing);
    }

    const salesTotal = sold.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
    const purchaseTotal = purchases.reduce((sum, l) => sum + (Number(l.price) || 0), 0);

    const transactions = [
      ...sold.map((l) => ({
        id: String(l._id),
        type: 'sale',
        title: l.title,
        amount: Number(l.price) || 0,
        currency: l.currency || 'NPR',
        date: l.updatedAt || l.createdAt,
      })),
      ...purchases.map((l) => ({
        id: `p-${l._id}`,
        type: 'purchase',
        title: l.title,
        amount: Number(l.price) || 0,
        currency: l.currency || 'NPR',
        date: l.updatedAt || l.createdAt,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      wallet: {
        currency: req.user.preferences?.currency || 'NPR (₨)',
        salesTotal,
        purchaseTotal,
        net: salesTotal - purchaseTotal,
        soldCount: sold.length,
        purchaseCount: purchases.length,
        inAppBalance: 0,
      },
      transactions,
      listings: sold.map((l) => listingPayload(l)),
    });
  } catch (error) {
    next(error);
  }
}

async function createSupportTicket(req, res, next) {
  try {
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required' });
    }
    const ticket = await SupportTicket.create({
      user: req.user._id,
      name: req.user.name || '',
      phone: req.user.phone || '',
      subject,
      message,
    });
    res.status(201).json({
      message: 'Support request sent. We will get back to you soon.',
      ticket: {
        id: ticket._id,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getMySupportTickets(req, res, next) {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({
      tickets: tickets.map((t) => ({
        id: String(t._id),
        subject: t.subject,
        message: t.message,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  getWallet,
  createSupportTicket,
  getMySupportTickets,
};
