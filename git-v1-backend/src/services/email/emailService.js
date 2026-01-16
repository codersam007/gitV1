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
const sendTeamInvitation = async (to, projectName, inviterName, invitationToken) => {
  const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${invitationToken}`;
  
  const subject = `Invitation to join ${projectName}`;
  const text = `
${inviterName} has invited you to join the project "${projectName}".

Accept invitation: ${acceptUrl}
  `;
  const html = `
    <h2>Project Invitation</h2>
    <p><strong>${inviterName}</strong> has invited you to join the project <strong>${projectName}</strong>.</p>
    <p><a href="${acceptUrl}">Accept Invitation</a></p>
  `;

  return emailService.sendEmail(to, subject, html, text);
};

module.exports = {
  sendMergeRequestNotification,
  sendMergeRequestApprovalNotification,
  sendTeamInvitation,
};
