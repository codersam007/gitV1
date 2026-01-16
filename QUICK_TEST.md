# Quick Test Reference Card

## 🚀 Start Everything

```bash
# Terminal 1: Start Backend
cd git-v1-backend
npm run dev

# Terminal 2: Start Frontend (Adobe Express Add-on)
# Open in Adobe Express development environment
```

## ✅ Quick Test Sequence (5 minutes)

1. **Verify Backend:** `http://localhost:3000/health` → Should return `{"status":"ok"}`

2. **Open Frontend:** Should auto-login and load

3. **Create Branch:**
   - Click "+ New Branch"
   - Type: `feature`, Name: `test`, Base: `main`
   - Click "Create Branch"
   - ✅ Should see success message

4. **Create Merge Request:**
   - Click "Merge" on the branch
   - Fill form, click "Create Merge Request"
   - ✅ Should see merge request #1

5. **Approve & Merge:**
   - Click "✓ Approve"
   - Click "Merge Now"
   - ✅ Should see "Merged" status

6. **Check Team:**
   - Go to "Team" tab
   - ✅ Should see yourself as owner

## 🐛 Quick Fixes

| Problem | Solution |
|---------|----------|
| CORS Error | Check backend CORS_ORIGIN in .env |
| 401 Unauthorized | Refresh page to re-login |
| Empty Data | Normal if nothing created yet |
| MongoDB Error | Start MongoDB: `brew services start mongodb-community` |

## 📍 Default Values

- **Project ID:** `proj_123`
- **User:** `user123` (test@example.com)
- **Backend URL:** `http://localhost:3000`
- **Token:** Auto-stored in localStorage

---

**Full Testing Guide:** See `TESTING_FLOW.md`
