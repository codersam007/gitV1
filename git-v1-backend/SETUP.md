# Setup Instructions

## Prerequisites

1. **Node.js** (v16 or higher)
2. **MongoDB** (running locally or connection string)
3. **npm** or **yarn**

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory. You can copy the content from `ENV_EXAMPLE.md`:

```bash
# Copy the example and modify as needed
cp ENV_EXAMPLE.md .env
```

Or manually create `.env` with:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/design-branch-manager
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRE=30d
STORAGE_PATH=./src/storage
MAX_FILE_SIZE=10485760
CORS_ORIGIN=http://localhost:3000
WS_PORT=3001
```

### 3. Start MongoDB

Make sure MongoDB is running:

```bash
# macOS (if installed via Homebrew)
brew services start mongodb-community

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 4. Run the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### 5. Verify Installation

The server should start on `http://localhost:3000`

Check health endpoint:
```bash
curl http://localhost:3000/health
```

## Project Structure

```
git-v1-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── services/        # Business logic services
│   ├── storage/         # Local file storage (design snapshots)
│   ├── utils/           # Utility functions
│   └── server.js        # Main server file
├── package.json
├── .env                 # Environment variables (create this)
└── README.md            # Backend architecture documentation
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login with Adobe token
- `POST /auth/refresh` - Refresh JWT token
- `GET /auth/me` - Get current user

### Projects
- `GET /api/v1/projects/:projectId` - Get project
- `POST /api/v1/projects` - Create project
- `PUT /api/v1/projects/:projectId/settings` - Update settings

### Branches
- `GET /api/v1/branches?projectId=:projectId` - Get all branches
- `GET /api/v1/branches/:branchName?projectId=:projectId` - Get branch
- `POST /api/v1/branches` - Create branch
- `DELETE /api/v1/branches/:branchName?projectId=:projectId` - Delete branch

### Commits
- `GET /api/v1/history?projectId=:projectId` - Get commit history
- `POST /api/v1/commits` - Create commit (with file upload)

### Merge Requests
- `GET /api/v1/merge-requests?projectId=:projectId` - Get merge requests
- `POST /api/v1/merge-requests` - Create merge request
- `POST /api/v1/merge-requests/:mergeRequestId/approve` - Approve
- `POST /api/v1/merge-requests/:mergeRequestId/merge` - Complete merge

### Team
- `GET /api/v1/team?projectId=:projectId` - Get team members
- `POST /api/v1/team/invite` - Invite member
- `POST /api/v1/team/accept-invite` - Accept invitation

## Notes

- **File Storage**: Currently uses local file system. See comments in `src/services/storage/fileStorage.js` for S3 migration.
- **Email Service**: Currently uses mock service. See comments in `src/services/email/emailService.js` for Mailgun/SendGrid integration.
- **WebSocket**: Real-time updates are available via Socket.io on the same port.

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env` file
- Verify MongoDB is accessible on the specified port

### Port Already in Use
- Change `PORT` in `.env` file
- Or kill the process using the port:
  ```bash
  lsof -ti:3000 | xargs kill
  ```

### Module Not Found
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`, then reinstall
