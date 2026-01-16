/**
 * Application Configuration
 * 
 * Centralized configuration management
 * Loads environment variables and provides default values
 */

require('dotenv').config();

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // MongoDB configuration
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/design-branch-manager',
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expire: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },
  
  // Adobe OAuth configuration (for future integration)
  adobe: {
    clientId: process.env.ADOBE_CLIENT_ID,
    clientSecret: process.env.ADOBE_CLIENT_SECRET,
    redirectUri: process.env.ADOBE_REDIRECT_URI,
  },
  
  // File storage configuration
  storage: {
    // Currently using local storage
    // TODO: Migrate to AWS S3 or Google Cloud Storage for production
    // Benefits: Scalability, CDN integration, better performance
    path: process.env.STORAGE_PATH || './src/storage',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
  },
  
  // Email service configuration
  email: {
    // Currently using mock email service
    // TODO: Integrate with Mailgun (recommended) or SendGrid
    // Mailgun recommendation:
    //   - Better deliverability rates
    //   - More affordable pricing
    //   - Better API documentation
    //   - Free tier: 5,000 emails/month for 3 months
    // SendGrid alternative:
    //   - Free tier: 100 emails/day
    //   - Good deliverability
    //   - Easy integration
    provider: process.env.EMAIL_PROVIDER || 'mock',
    mailgunApiKey: process.env.MAILGUN_API_KEY,
    mailgunDomain: process.env.MAILGUN_DOMAIN,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  
  // WebSocket configuration
  wsPort: process.env.WS_PORT || 3001,
};
