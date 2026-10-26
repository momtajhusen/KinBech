const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./models/User');
const { connectDb } = require('./config/db');

/**
 * Creates the first super admin. No credentials live in git:
 *   ADMIN_SEED_EMAIL=you@company.com npm run seed:admin
 * A random password is printed once and must be changed at first login.
 */
const seedAdmin = async () => {
  const email = String(process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.error('Set ADMIN_SEED_EMAIL to the super admin email, then run again.');
    process.exit(1);
  }

  try {
    await connectDb();

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log(`An account for ${email} already exists. Nothing changed.`);
      process.exit(0);
    }

    const password = crypto.randomBytes(12).toString('base64url');
    await User.create({
      name: String(process.env.ADMIN_SEED_NAME || 'Super Admin').trim(),
      email,
      password: await bcrypt.hash(password, 12),
      role: 'super_admin',
      profileComplete: true,
      mustChangePassword: true,
    });

    console.log(`Super admin created for ${email}.`);
    console.log(`One-time password (change it at first login): ${password}`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
