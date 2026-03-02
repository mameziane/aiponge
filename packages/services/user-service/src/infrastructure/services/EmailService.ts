import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import { AuthError } from '../../application/errors/errors';

const logger = getLogger('email-service');

const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

function getCredentials(): ResendCredentials {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw AuthError.internalError('RESEND_API_KEY environment variable is not configured');
  }

  return {
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  };
}

class EmailService {
  isConfigured(): boolean {
    try {
      getCredentials();
      return true;
    } catch {
      return false;
    }
  }

  async sendPasswordResetCode(
    email: string,
    code: string,
    expiresInMinutes: number = 15
  ): Promise<{ success: boolean; error?: string }> {
    const subject = 'Your aiponge Password Reset Code';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background-color: #1a1a1a; border-radius: 16px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #9b59b6; font-size: 28px; margin: 0;">aiponge</h1>
            </div>
            
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 16px; text-align: center;">Password Reset Code</h2>
            
            <p style="color: #888; font-size: 16px; line-height: 24px; margin: 0 0 24px; text-align: center;">
              You requested to reset your password. Enter this code in the app to continue:
            </p>
            
            <div style="background-color: #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 36px; font-weight: bold; color: #9b59b6; letter-spacing: 8px;">${code}</span>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 20px; margin: 0 0 24px; text-align: center;">
              This code will expire in ${expiresInMinutes} minutes. If you didn't request this, please ignore this email.
            </p>
            
            <div style="border-top: 1px solid #333; padding-top: 24px; text-align: center;">
              <p style="color: #555; font-size: 12px; margin: 0;">
                aiponge - Your Personal Music Journey
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Your aiponge Password Reset Code

You requested to reset your password. Enter this code in the app:

${code}

This code will expire in ${expiresInMinutes} minutes.

If you didn't request this, please ignore this email.

- aiponge Team
    `.trim();

    return this.send({ to: email, subject, html, text });
  }

  async sendPasswordResetConfirmation(email: string): Promise<{ success: boolean; error?: string }> {
    const subject = 'Your aiponge Password Has Been Reset';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Confirmation</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background-color: #1a1a1a; border-radius: 16px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #9b59b6; font-size: 28px; margin: 0;">aiponge</h1>
            </div>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 48px;">✓</span>
            </div>
            
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 16px; text-align: center;">Password Successfully Reset</h2>
            
            <p style="color: #888; font-size: 16px; line-height: 24px; margin: 0 0 24px; text-align: center;">
              Your password has been successfully changed. You can now log in with your new password.
            </p>
            
            <p style="color: #666; font-size: 14px; line-height: 20px; margin: 0 0 24px; text-align: center;">
              If you didn't make this change, please contact our support team immediately.
            </p>
            
            <div style="border-top: 1px solid #333; padding-top: 24px; text-align: center;">
              <p style="color: #555; font-size: 12px; margin: 0;">
                aiponge - Your Personal Music Journey
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Your aiponge Password Has Been Reset

Your password has been successfully changed. You can now log in with your new password.

If you didn't make this change, please contact our support team immediately.

- aiponge Team
    `.trim();

    return this.send({ to: email, subject, html, text });
  }

  async sendGiftNotification(
    recipientEmail: string,
    senderName: string,
    creditsAmount: number,
    claimToken: string,
    message?: string
  ): Promise<{ success: boolean; error?: string }> {
    const subject = `You received ${creditsAmount} credits on aiponge!`;

    const personalMessage = message
      ? `<p style="color: #ccc; font-size: 16px; line-height: 24px; margin: 0 0 24px; text-align: center; font-style: italic;">"${message}"</p>`
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Credit Gift</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background-color: #1a1a1a; border-radius: 16px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #9b59b6; font-size: 28px; margin: 0;">aiponge</h1>
            </div>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 48px;">🎁</span>
            </div>
            
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 16px; text-align: center;">You Received a Gift!</h2>
            
            <p style="color: #888; font-size: 16px; line-height: 24px; margin: 0 0 16px; text-align: center;">
              <strong style="color: #9b59b6;">${senderName}</strong> sent you <strong style="color: #9b59b6;">${creditsAmount} credits</strong> on aiponge.
            </p>
            
            ${personalMessage}
            
            <div style="background-color: #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <p style="color: #888; font-size: 14px; margin: 0 0 8px;">Your claim code:</p>
              <span style="font-size: 24px; font-weight: bold; color: #9b59b6; letter-spacing: 4px;">${claimToken}</span>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 20px; margin: 0 0 24px; text-align: center;">
              Open the aiponge app and claim your gift to start creating!
            </p>
            
            <div style="border-top: 1px solid #333; padding-top: 24px; text-align: center;">
              <p style="color: #555; font-size: 12px; margin: 0;">
                aiponge - Your Personal Music Journey
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
You Received a Gift on aiponge!

${senderName} sent you ${creditsAmount} credits.
${message ? `\nMessage: "${message}"\n` : ''}
Your claim code: ${claimToken}

Open the aiponge app and claim your gift to start creating!

- aiponge Team
    `.trim();

    return this.send({ to: recipientEmail, subject, html, text });
  }

  private async send(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
    try {
      const { apiKey, fromEmail } = getCredentials();

      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `aiponge <${fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const result = await response.json();

      if (!response.ok) {
        logger.error('Resend API error', {
          status: response.status,
          error: result,
          to: options.to,
        });
        return {
          success: false,
          error: result.message || `Email delivery failed: ${response.status}`,
        };
      }

      logger.info('Email sent successfully', { to: options.to, subject: options.subject, id: result.id });
      return { success: true };
    } catch (error) {
      logger.error('Email send error', {
        error: serializeError(error),
        to: options.to,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email delivery failed',
      };
    }
  }
}

export const emailService = new EmailService();
