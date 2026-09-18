# KinBech - Local Marketplace Application

A complete local marketplace solution with mobile app, backend API, and admin panel.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd KinBech
```

2. **Install root dependencies**
```bash
npm install
```

3. **Install individual service dependencies**
```bash
cd Backend && npm install && cd ..
cd Admin && npm install && cd ..
cd Mobile && npm install && cd ..
cd Website && npm install && cd ..
```

4. **Start MongoDB**
Make sure MongoDB is running locally on port 27017 or update the connection string in `Backend/src/config/db.js`

### Running the Project

#### Run All Services (Recommended)
```bash
# Development mode (Backend + Admin Panel)
npm run dev

# Production mode
npm start
```

#### Run Individual Services

**Backend API**
```bash
cd Backend
npm run dev        # Development with hot reload
npm start          # Production
```
- API runs on: http://localhost:5001

**Admin Panel**
```bash
cd Admin
npm run dev        # Development with hot reload
npm run build      # Build for production
npm run preview    # Preview production build
```
- Admin panel runs on: http://localhost:5173 (dev)

**Mobile App**
```bash
cd Mobile
npm start          # Start Expo development server
```
- Scan QR code with Expo Go app

**Public Website**
```bash
cd Website
npm run dev        # Development with hot reload
npm run build      # Build for production
npm run preview    # Preview production build
```
- Public site runs on: http://localhost:5180 (dev)

Or from the repo root: `npm run website:dev`

## 📁 Project Structure

```
KinBech/
├── Backend/          # Node.js + Express API
├── Admin/            # React + Vite Admin Panel
├── Mobile/           # React Native + Expo Mobile App
├── Website/          # React + Vite public marketing site
├── package.json      # Root scripts for running all services
└── README.md         # This file
```

## 🔗 Service URLs

- **Backend API:** http://localhost:5001
- **Admin Panel:** http://localhost:5173
- **Public Website:** http://localhost:5180
- **Explore (live API):** http://localhost:5180/explore
- **Categories:** http://localhost:5180/categories
- **Features:** http://localhost:5180/features
- **How it works:** http://localhost:5180/how-it-works
- **For sellers:** http://localhost:5180/sellers
- **Safety:** http://localhost:5180/safety
- **FAQ:** http://localhost:5180/faq
- **Download:** http://localhost:5180/download
- **Mobile App:** Via Expo Go (scan QR code)

## 📱 Features

### Mobile App
- Phone-based authentication
- Individual & Shop seller modes
- Location-based item discovery
- Real-time chat
- Reviews & ratings
- Wishlist functionality

### Admin Panel
- Dashboard with statistics
- User management
- Shop verification
- Listing moderation
- Review moderation
- Report handling
- Broadcast notifications

## 📚 Documentation

For detailed project documentation, see [PROJECT_REPORT.md](./PROJECT_REPORT.md)

## ⚠️ Development Notes

- Admin Panel connects to live Backend APIs (users, shops, listings, categories)
- Public Website is a static marketing landing page (no API required)
- Backend API is fully functional for mobile app
- MongoDB connection required for backend to work

## 🛠️ Troubleshooting

**MongoDB Connection Error**
- Ensure MongoDB is running: `mongod` or use MongoDB Atlas
- Check connection string in `Backend/src/config/db.js`

**Port Already in Use**
- Backend uses port 5001
- Admin panel uses port 5173
- Public website uses port 5180 (dev) / 4180 (preview)
- Mobile uses Expo's default ports

**Dependencies Issues**
- Delete `node_modules` and run `npm install` again
- Try clearing npm cache: `npm cache clean --force`

## 📄 License

This project is private and confidential.

---

**Last Updated:** September 9, 2026


============ admin default login ===============
 Default admin user create ho gaya:
 
Email: admin@kinbech.com
Password: admin123
Phone: 9800000000

<!-- relese build -->
<!-- // cd android && ./gradlew assembleRelease -- .apk -->
<!-- // cd android && ./gradlew bundleRelease  -- .abb -->