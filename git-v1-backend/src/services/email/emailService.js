/**
 * Email Service
 * 
 * Handles sending emails for notifications
 * Currently uses mock email service (logs to console)
 * 
 * TODO: Integrate with Mailgun (recommended) or SendGrid
 * 
 * Mailgun Recommendation:
 * - Better deliverability rates (98%+)
 * - More affordable pricing ($0.80 per 1,000 emails after free tier)
 * - Free tier: 5,000 emails/month for 3 months
 * - Better API documentation and support
 * - Easy webhook integration for tracking
 * 
 * SendGrid Alternative:
 * - Free tier: 100 emails/day forever
 * - Good deliverability
 * - Easy integration
 * - Good for low-volume applications
 */

const config = require('../../config/config');

/**
 * Mock email service - logs emails to console
 * Replace this with actual email service when ready
 */
class MockEmailService {
  async sendEmail(to, subject, html, text) {
    console.log('='.repeat(60));
    console.log('📧 MOCK EMAIL SENT');
    console.log('='.repeat(60));
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text);
    console.log('HTML:', html);
    console.log('='.repeat(60));
    
    // Simulate async email sending
    return Promise.resolve({
      success: true,
      messageId: `mock-${Date.now()}`,
    });
  }
}

/**
 * Mailgun email service implementation
 * TODO: Uncomment and configure when ready
 * 
 * const formData = require('form-data');
 * const Mailgun = require('mailgun.js');
 * 
 * class MailgunService {
 *   constructor() {
 *     const mailgun = new Mailgun(formData);
 *     this.client = mailgun.client({
 *       username: 'api',
 *       key: config.email.mailgunApiKey,
 *     });
 *     this.domain = config.email.mailgunDomain;
 *   }
 * 
 *   async sendEmail(to, subject, html, text) {
 *     const messageData = {
 *       from: `Design Branch Manager <noreply@${this.domain}>`,
 *       to: [to],
 *       subject: subject,
 *       text: text,
 *       html: html,
 *     };
 * 
 *     try {
 *       const response = await this.client.messages.create(this.domain, messageData);
 *       return {
 *         success: true,
 *         messageId: response.id,
 *       };
 *     } catch (error) {
 *       console.error('Mailgun error:', error);
 *       throw new Error('Failed to send email');
 *     }
 *   }
 * }
 */

/**
 * SendGrid email service implementation
 * TODO: Uncomment and configure when ready
 * 
 * const sgMail = require('@sendgrid/mail');
 * 
 * class SendGridService {
 *   constructor() {
 *     sgMail.setApiKey(config.email.sendgridApiKey);
 *   }
 * 
 *   async sendEmail(to, subject, html, text) {
 *     const msg = {
 *       to: to,
 *       from: 'noreply@designbranchmanager.com',
 *       subject: subject,
 *       text: text,
 *       html: html,
 *     };
 * 
 *     try {
 *       await sgMail.send(msg);
 *       return {
 *         success: true,
 *         messageId: 'sent',
 *       };
 *     } catch (error) {
 *       console.error('SendGrid error:', error);
 *       throw new Error('Failed to send email');
 *     }
 *   }
 * }
 */

// Initialize email service based on config
let emailService;

if (config.email.provider === 'mailgun' && config.email.mailgunApiKey) {
  // emailService = new MailgunService();
  emailService = new MockEmailService(); // Fallback to mock for now
  console.log('⚠️  Mailgun configured but not implemented. Using mock service.');
} else if (config.email.provider === 'sendgrid' && config.email.sendgridApiKey) {
  // emailService = new SendGridService();
  emailService = new MockEmailService(); // Fallback to mock for now
  console.log('⚠️  SendGrid configured but not implemented. Using mock service.');
} else {
  emailService = new MockEmailService();
  console.log('📧 Using mock email service. Configure Mailgun or SendGrid for production.');
}

/**
 * Send merge request notification
 * @param {String} to - Recipient email
 * @param {String} projectName - Project name
 * @param {String} mergeRequestTitle - Merge request title
 * @param {String} mergeRequestUrl - URL to view merge request
 */
const sendMergeRequestNotification = async (to, projectName, mergeRequestTitle, mergeRequestUrl) => {
  const subject = `New Merge Request: ${mergeRequestTitle}`;
  const text = `
A new merge request has been created in ${projectName}.

Title: ${mergeRequestTitle}

View and review: ${mergeRequestUrl}
  `;
  const html = `
    <h2>New Merge Request</h2>
    <p>A new merge request has been created in <strong>${projectName}</strong>.</p>
    <p><strong>Title:</strong> ${mergeRequestTitle}</p>
    <p><a href="${mergeRequestUrl}">View and Review</a></p>
  `;

  return emailService.sendEmail(to, subject, html, text);
};

/**
 * Send merge request approval notification
 * @param {String} to - Recipient email
 * @param {String} projectName - Project name
 * @param {String} mergeRequestTitle - Merge request title
 */
const sendMergeRequestApprovalNotification = async (to, projectName, mergeRequestTitle) => {
  const subject = `Merge Request Approved: ${mergeRequestTitle}`;
  const text = `
Your merge request has been approved in ${projectName}.

Title: ${mergeRequestTitle}
  `;
  const html = `
    <h2>Merge Request Approved</h2>
    <p>Your merge request has been approved in <strong>${projectName}</strong>.</p>
    <p><strong>Title:</strong> ${mergeRequestTitle}</p>
  `;

  return emailService.sendEmail(to, subject, html, text);
};

/**
 * Send team invitation email
 * @param {String} to - Recipient email
 * @param {String} projectName - Project name
 * @param {String} inviterName - Name of person who invited
 * @param {String} invitationToken - Token to accept invitation
 */
const sendTeamInvitation = async (to, projectName, inviterName, invitationToken, projectId) => {
  // Create invitation link that works with Adobe Express add-on
  // Format: express.adobe.com/add-ons/[ADDON_ID]?invite_token=[TOKEN]&project_id=[PROJECT_ID]
  const addonBaseUrl = process.env.ADDON_BASE_URL || 'https://express.adobe.com/add-ons';
  const addonId = process.env.ADDON_ID || 'your-addon-id'; // Should be set in environment
  const acceptUrl = `${addonBaseUrl}/${addonId}?invite_token=${invitationToken}&project_id=${projectId}`;
  
  const subject = `Invitation to join ${projectName}`;
  const text = `
${inviterName} has invited you to join the project "${projectName}".

You'll be added as a Designer with access to:
- Create and manage branches
- Create commits and merge requests
- Review and approve merge requests

To accept this invitation:
1. Open Adobe Express
2. Open the Design Branch Manager add-on
3. The invitation will be automatically detected

Or click this link: ${acceptUrl}

This invitation expires in 7 days.
If you didn't request this invitation, you can safely ignore this email.
  `;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #202122; margin-bottom: 16px;">Project Invitation</h2>
      <p style="color: #202122; font-size: 14px; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join the project <strong>${projectName}</strong>.
      </p>
      
      <div style="background: #F5F5F5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #202122;">You'll be added as a <strong>Designer</strong> with access to:</p>
        <ul style="margin: 0; padding-left: 20px; color: #202122;">
          <li>Create and manage branches</li>
          <li>Create commits and merge requests</li>
          <li>Review and approve merge requests</li>
        </ul>
      </div>
      
      <div style="background: #1473E6; padding: 12px 24px; border-radius: 4px; text-align: center; margin: 24px 0;">
        <a href="${acceptUrl}" style="color: white; text-decoration: none; font-weight: 600; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      
      <p style="color: #6F6F6F; font-size: 12px; line-height: 1.6; margin-top: 24px;">
        <strong>How to accept:</strong><br>
        1. Open Adobe Express<br>
        2. Open the Design Branch Manager add-on<br>
        3. The invitation will be automatically detected
      </p>
      
      <p style="color: #6F6F6F; font-size: 12px; margin-top: 16px;">
        This invitation expires in 7 days.<br>
        If you didn't request this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  return emailService.sendEmail(to, subject, html, text);
};

module.exports = {
  sendMergeRequestNotification,
  sendMergeRequestApprovalNotification,
  sendTeamInvitation,
};
