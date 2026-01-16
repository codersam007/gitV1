# API Testing Guide

## Testing Tools

**Recommended:**
- ✅ **Hopscotch** (macOS) - Great UI, easy to use
- **Postman** - Industry standard, powerful features
- **Insomnia** - Clean interface, good for REST APIs
- **curl** - Command line (built-in on macOS)

## Prerequisites

1. **Start MongoDB:**
   ```bash
   brew services start mongodb-community
   # OR
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

2. **Start Backend Server:**
   ```bash
   npm run dev
   ```

3. **Verify Server is Running:**
   ```bash
   curl http://localhost:3000/health
   ```

## Test Flow

### Step 1: Health Check
**GET** `http://localhost:3000/health`

Expected Response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-16T...",
  "environment": "development"
}
```

---

### Step 2: Create/Login User
**POST** `http://localhost:3000/auth/login`

Headers:
```
Content-Type: application/json
```

Body:
```json
{
  "adobeToken": "mock-token-for-now",
  "userId": "user123",
  "email": "test@example.com",
  "name": "Test User",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

Expected Response:
```json
{
  "success": true,
  "user": {
    "userId": "user123",
    "email": "test@example.com",
    "name": "Test User",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**💡 Save the `token` - you'll need it for all other requests!**

---

### Step 3: Get Current User
**GET** `http://localhost:3000/auth/me`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

Expected Response:
```json
{
  "success": true,
  "user": {
    "userId": "user123",
    "email": "test@example.com",
    "name": "Test User",
    "avatarUrl": "https://example.com/avatar.jpg",
    "preferences": {...}
  }
}
```

---

### Step 4: Create Project
**POST** `http://localhost:3000/api/v1/projects`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

Body:
```json
{
  "projectId": "proj_123",
  "name": "My Test Project",
  "description": "Testing the API"
}
```

Expected Response:
```json
{
  "success": true,
  "project": {
    "projectId": "proj_123",
    "name": "My Test Project",
    "mainBranch": {...}
  }
}
```

**💡 Save the `projectId` - you'll need it for branch/merge requests!**

---

### Step 5: Get Project
**GET** `http://localhost:3000/api/v1/projects/proj_123`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### Step 6: Create Branch
**POST** `http://localhost:3000/api/v1/branches`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

Body:
```json
{
  "projectId": "proj_123",
  "name": "new-feature",
  "type": "feature",
  "description": "Testing branch creation",
  "baseBranch": "main"
}
```

Expected Response:
```json
{
  "success": true,
  "branch": {
    "name": "feature/new-feature",
    "type": "feature",
    "status": "active"
  }
}
```

---

### Step 7: Get All Branches
**GET** `http://localhost:3000/api/v1/branches?projectId=proj_123`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### Step 8: Create Merge Request
**POST** `http://localhost:3000/api/v1/merge-requests`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

Body:
```json
{
  "projectId": "proj_123",
  "sourceBranch": "feature/new-feature",
  "targetBranch": "main",
  "title": "Merge new feature",
  "description": "Testing merge request creation"
}
```

Expected Response:
```json
{
  "success": true,
  "mergeRequest": {
    "mergeRequestId": 1,
    "status": "open",
    "title": "Merge new feature"
  }
}
```

---

### Step 9: Get Merge Requests
**GET** `http://localhost:3000/api/v1/merge-requests?projectId=proj_123`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### Step 10: Get Commit History
**GET** `http://localhost:3000/api/v1/history?projectId=proj_123&limit=10`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### Step 11: Get Team Members
**GET** `http://localhost:3000/api/v1/team?projectId=proj_123`

Headers:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## Testing Tips for Hopscotch

1. **Create Collections:**
   - Group requests by feature (Auth, Projects, Branches, etc.)

2. **Use Variables:**
   - Save `token` as a variable
   - Save `projectId` as a variable
   - Use `{{token}}` and `{{projectId}}` in requests

3. **Test Error Cases:**
   - Try requests without token (should get 401)
   - Try invalid projectId (should get 404)
   - Try duplicate branch names (should get 409)

4. **Test Authorization:**
   - Create a second user
   - Try accessing projects you don't belong to (should get 403)

## Common Issues

### 401 Unauthorized
- Token expired or missing
- Solution: Login again to get new token

### 404 Not Found
- Resource doesn't exist
- Check projectId/branchName spelling

### 500 Internal Server Error
- Check server logs
- Verify MongoDB is running
- Check .env file configuration

## Quick curl Commands

```bash
# Health check
curl http://localhost:3000/health

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"adobeToken":"test","userId":"user123","email":"test@example.com","name":"Test User"}'

# Get project (replace TOKEN and projectId)
curl http://localhost:3000/api/v1/projects/proj_123 \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

1. Test all endpoints in order
2. Test error scenarios
3. Test with multiple users
4. Test WebSocket connections (use Socket.io client)
5. Test file uploads (for commits)

Happy Testing! 🚀
