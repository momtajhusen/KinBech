const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { connectDb } = require('./config/db');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    await connectDb();

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@kinbech.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create admin user
    const admin = await User.create({
      name: 'Super Admin',
      email: 'admin@kinbech.com',
      password: hashedPassword,
      phone: '9800000000', // Default phone number
      role: 'super_admin',
      profileComplete: true,
    });

    console.log('Admin user created successfully:');
    console.log('Email: admin@kinbech.com');
    console.log('Password: admin123');
    console.log('Phone: 9800000000');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();