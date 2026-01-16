# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env` File
Copy content from `ENV_EXAMPLE.md` or create `.env` with:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/design-branch-manager
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
```

### 3. Start MongoDB & Server
```bash
# Start MongoDB (if not running)
brew services start mongodb-community
# OR
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Start server
npm run dev
```

## ✅ Verify It's Working

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "environment": "development"
}
```

## 📝 Next Steps

1. **Connect Frontend**: Update `API_BASE_URL` in frontend to `http://localhost:3000`
2. **Test API**: Use Postman or curl to test endpoints
3. **Configure Email**: See `src/services/email/emailService.js` for Mailgun setup
4. **Migrate Storage**: See `src/services/storage/fileStorage.js` for S3 setup

## 📚 Documentation

- **Architecture**: See `README.md`
- **Setup Details**: See `SETUP.md`
- **API Endpoints**: See `README.md` section 3
