# Environment Variables Example

Copy this content to create your `.env` file:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/design-branch-manager

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRE=30d

# Adobe OAuth Configuration (for future integration)
ADOBE_CLIENT_ID=your-adobe-client-id
ADOBE_CLIENT_SECRET=your-adobe-client-secret
ADOBE_REDIRECT_URI=http://localhost:3000/auth/adobe/callback

# File Storage Configuration
# Currently using local storage
# TODO: Migrate to AWS S3 or Google Cloud Storage for production
STORAGE_PATH=./src/storage
MAX_FILE_SIZE=10485760

# Email Service Configuration
# Currently using mock email service
# TODO: Integrate with Mailgun (recommended) or SendGrid for production
# Mailgun is recommended for better deliverability and pricing
# MAILGUN_API_KEY=your-mailgun-api-key
# MAILGUN_DOMAIN=your-mailgun-domain
# SENDGRID_API_KEY=your-sendgrid-api-key (alternative)

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# WebSocket Configuration
WS_PORT=3001
```
