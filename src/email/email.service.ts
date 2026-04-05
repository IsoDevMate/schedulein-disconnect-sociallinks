import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as sgMail from "@sendgrid/mail";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly appName: string;
  private readonly sendgridApiKey: string;
  private readonly isSendGridConfigured: boolean;
  private readonly emailProvider: string;
  private readonly gmailTransporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.sendgridApiKey = this.configService.get<string>("SENDGRID_API_KEY");
    this.isSendGridConfigured = !!this.sendgridApiKey;
    this.emailProvider = this.configService.get<string>(
      "EMAIL_PROVIDER",
      "sendgrid",
    );

    if (this.isSendGridConfigured) {
      sgMail.setApiKey(this.sendgridApiKey);
    }

    // Initialize Gmail transporter if configured
    const gmailUser = this.configService.get<string>("GMAIL_USER");
    const gmailAppPassword =
      this.configService.get<string>("GMAIL_APP_PASSWORD");

    if (gmailUser && gmailAppPassword) {
      this.gmailTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });
      this.logger.log("Gmail transporter configured successfully");
    } else {
      this.logger.warn(
        "Gmail credentials not configured. Gmail fallback will not be available.",
      );
    }

    this.fromEmail = this.configService.get<string>(
      "EMAIL_FROM",
      "oumabarack1047@gmail.com",
    );
    this.appName = this.configService.get<string>("APP_NAME", "GROREELS");
  }

  /**
   * Get the appropriate email transporter based on configuration
   */
  private getEmailTransporter(): "sendgrid" | "gmail" | "fallback" {
    if (this.emailProvider === "gmail" && this.gmailTransporter) {
      return "gmail";
    }

    if (this.isSendGridConfigured) {
      return "sendgrid";
    }

    if (this.gmailTransporter) {
      return "gmail";
    }

    return "fallback";
  }

  /**
   * Send email using the configured provider with fallback
   */
  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<void> {
    const transporter = this.getEmailTransporter();
    const senderEmail = from || `${this.appName} <${this.fromEmail}>`;

    this.logger.log(`Attempting to send email via: ${transporter}`);
    this.logger.log(`From: ${senderEmail}`);
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);

    try {
      switch (transporter) {
        case "sendgrid":
          await this.sendWithSendGrid(to, subject, html, senderEmail);
          break;
        case "gmail":
          await this.sendWithGmail(to, subject, html, senderEmail);
          break;
        case "fallback":
          await this.sendFallbackEmail(to, subject, html);
          break;
      }
    } catch (error) {
      this.logger.error(`Primary email provider failed: ${transporter}`, error);

      // Try fallback if primary failed
      if (transporter !== "gmail" && this.gmailTransporter) {
        this.logger.log("Attempting Gmail fallback...");
        try {
          await this.sendWithGmail(to, subject, html, senderEmail);
          this.logger.log("Gmail fallback successful");
        } catch (fallbackError) {
          this.logger.error("Gmail fallback also failed", fallbackError);
          await this.sendFallbackEmail(to, subject, html);
        }
      } else if (transporter !== "sendgrid" && this.isSendGridConfigured) {
        this.logger.log("Attempting SendGrid fallback...");
        try {
          await this.sendWithSendGrid(to, subject, html, senderEmail);
          this.logger.log("SendGrid fallback successful");
        } catch (fallbackError) {
          this.logger.error("SendGrid fallback also failed", fallbackError);
          await this.sendFallbackEmail(to, subject, html);
        }
      } else {
        await this.sendFallbackEmail(to, subject, html);
      }
    }

    this.logger.log(`Email sent successfully to: ${to}`);
  }

  /**
   * Send email using SendGrid
   */
  private async sendWithSendGrid(
    to: string,
    subject: string,
    html: string,
    from: string,
  ): Promise<void> {
    const msg = {
      to,
      from,
      subject,
      html,
    };

    await sgMail.send(msg);
    this.logger.log(`Email sent via SendGrid to ${to}`);
  }

  /**
   * Send email using Gmail
   */
  private async sendWithGmail(
    to: string,
    subject: string,
    html: string,
    from: string,
  ): Promise<void> {
    if (!this.gmailTransporter) {
      throw new Error("Gmail transporter not configured");
    }

    const mailOptions = {
      from,
      to,
      subject,
      html,
    };

    await this.gmailTransporter.sendMail(mailOptions);
    this.logger.log(`Email sent via Gmail to ${to}`);
  }

  /**
   * Fallback email service that logs to console
   */
  private async sendFallbackEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    this.logger.warn(`FALLBACK EMAIL SERVICE - Email would be sent to: ${to}`);
    this.logger.warn(`Subject: ${subject}`);
    this.logger.warn(`Content: ${html.replace(/<[^>]*>/g, "")}`); // Strip HTML tags for console
    this.logger.warn(
      "In production, please configure email providers properly",
    );
  }

  /**
   * Check if any email service is available
   */
  public isEmailServiceAvailable(): boolean {
    return this.isSendGridConfigured || !!this.gmailTransporter;
  }

  /**
   * Get current email provider status
   */
  public getEmailProviderStatus(): {
    primary: string;
    sendgrid: boolean;
    gmail: boolean;
  } {
    return {
      primary: this.getEmailTransporter(),
      sendgrid: this.isSendGridConfigured,
      gmail: !!this.gmailTransporter,
    };
  }

  private getBaseEmailTemplate(content: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Notification</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                padding: 20px 0;
                border-bottom: 2px solid #f0f0f0;
            }
            .content {
                padding: 20px 0;
            }
            .code {
                background-color: #f8f8f8;
                padding: 15px;
                border-radius: 6px;
                font-size: 24px;
                text-align: center;
                letter-spacing: 5px;
                margin: 20px 0;
                font-family: monospace;
            }
            .button {
                display: inline-block;
                background-color:rgb(14, 15, 17);
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
                margin: 15px 0;
            }
            .button:hover {
                background-color:rgb(62, 190, 30);
            }
            .warning {
                color: #856404;
                background-color: #fff3cd;
                padding: 10px;
                border-radius: 4px;
                margin: 15px 0;
                font-size: 14px;
            }
            .footer {
                text-align: center;
                padding-top: 20px;
                border-top: 1px solid #f0f0f0;
                font-size: 12px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            ${content}
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
                <p>&copy; ${new Date().getFullYear()} Groreels. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  async sendConfirmationEmail(
    to: string,
    confirmationCode: string,
    confirmationLink?: string,
  ): Promise<void> {
    const baseUrl =
      this.configService.get<string>("FRONTEND_URL") || "https://groreels.com";
    // SECURITY: Include email in confirmation link for additional validation
    const defaultLink = `${baseUrl}/auth/confirm-email?token=${confirmationCode}&email=${encodeURIComponent(to)}`;
    const link = confirmationLink || defaultLink;

    const content = `
        <div class="header">
            <h1 style="color: #333;">Confirm Your Email</h1>
        </div>
        <div class="content">
            <p>Thank you for registering with Groreels! Please verify your email address to complete your registration.</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" class="button">Verify Email Address</a>
            </div>

            <p style="text-align: center; margin: 20px 0;">
                <strong>Or use this verification code:</strong>
            </p>
            <div class="code">${confirmationCode}</div>

            <p style="text-align: center; font-size: 14px; color: #666;">
                Enter this code on the verification page if the button doesn't work.
            </p>

            <div class="warning">
                ⚠️ This verification link and code will expire in 30 minutes for security reasons.
            </div>

            <p style="color: #666; font-size: 14px;">
                If you didn't create an account with Groreels, please ignore this email.
            </p>
        </div>
    `;

    await this.sendEmail(
      to,
      "Confirm Your Email - Groreels",
      this.getBaseEmailTemplate(content),
    );
  }

  async sendPasswordResetEmail(
    to: string,
    resetCode: string,
    resetLink?: string,
  ): Promise<void> {
    this.logger.log(`Sending password reset email to: ${to}`);
    this.logger.log(`Reset code: ${resetCode}`);

    const baseUrl =
      this.configService.get<string>("FRONTEND_URL") || "https://groreels.com";
    const defaultLink = `${baseUrl}/reset-password?code=${resetCode}&email=${encodeURIComponent(to)}`;
    const link = resetLink || defaultLink;

    this.logger.log(`Generated reset link: ${link}`);

    const content = `
        <div class="header">
            <h1 style="color: #333;">Reset Your Password</h1>
        </div>
        <div class="content">
            <p>We received a request to reset your password for your Groreels account. Use the button below to create a new password:</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" class="button">Reset Password</a>
            </div>

            <p style="text-align: center; margin: 20px 0;">
                <strong>Or use this reset code:</strong>
            </p>
            <div class="code">${resetCode}</div>

            <p style="text-align: center; font-size: 14px; color: #666;">
                Enter this code on the password reset page if the button doesn't work.
            </p>

            <div class="warning">
                ⚠️ This reset link and code will expire in 30 minutes for security reasons.<br>
                If you didn't request this reset, please secure your account.
            </div>

            <p style="color: #666; font-size: 14px;">
                For security reasons, if you did not request a password reset,
                please ignore this email and make sure you can still login to your account.
            </p>
        </div>
    `;

    await this.sendEmail(
      to,
      "Reset Your Password - Groreels",
      this.getBaseEmailTemplate(content),
    );
  }

  async sendPasswordChangedEmail(to: string): Promise<void> {
    const content = `
        <div class="header">
            <h1 style="color: #333;">Password Changed Successfully</h1>
        </div>
        <div class="content">
            <p>Your Groreels account password has been successfully changed.</p>
            <p>If you did not make this change, please contact our support team immediately at <a href="mailto:support@groreels.com">support@groreels.com</a>.</p>
            <div class="warning">
                ⚠️ For security, you'll need to sign in again on all your devices with your new password.
            </div>
        </div>
    `;

    await this.sendEmail(
      to,
      "Password Changed Successfully - Groreels",
      this.getBaseEmailTemplate(content),
    );
  }

  // Send email to customer with a link to update payment details
  async sendSubscriptionEndingEmail(to: string): Promise<void> {
    const content = `
            <div class="header">
                <h1 style="color: #333;">Your Subscription is Ending Soon</h1>
            </div>
            <div class="content">
                <p>Your subscription is ending soon. To continue using our service, please update your payment details.</p>
                <p>Click the link below to update your payment information:</p>
                <a href="https://groreels.com/update-payment">Update Payment Details</a>
                <div class="warning">
                    ⚠️ If your subscription ends, you will lose access to premium features.
                </div>
            </div>
        `;

    await this.sendEmail(
      to,
      "Your Subscription is Ending Soon",
      this.getBaseEmailTemplate(content),
    );
  }

  // Send invitation email to potential agency member
  async sendAgencyInviteEmail(to: string, agencyName: string): Promise<void> {
    const content = `
            <div class="header">
                <h1 style="color: #333;">You've Been Invited to Join ${agencyName}</h1>
            </div>
            <div class="content">
                <p>You've been invited to join ${agencyName} on our platform.</p>
                <p>Click the link below to accept the invitation:</p>
                <a href="https://groreels.com/accept-invite">Accept Invitation</a>
                <div class="warning">
                    ⚠️ If you're not sure about this invitation, please contact the agency admin.
                </div>
            </div>
        `;

    await this.sendEmail(
      to,
      `You've Been Invited to Join ${agencyName}`,
      this.getBaseEmailTemplate(content),
    );
  }
}
