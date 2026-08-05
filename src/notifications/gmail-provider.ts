import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailProvider, SendEmailOptions } from './email-provider';

export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const GMAIL_SMTP_PORT = 465;

export interface GmailProviderConfig {
  user: string;
  password: string;
  to: string;
}

export interface GmailProviderFromEnvOptions {
  /** Recipient from `data/settings.json` (`emailTo`). Falls back to the sender. */
  to?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * The "From" address is always the authenticated SMTP user — a single source
 * of truth (there is no separate `MAIL_FROM` configuration anywhere).
 */
export function mailFrom(smtpUser: string): string {
  return smtpUser;
}

export function gmailTransportOptions(user: string, password: string): Record<string, unknown> {
  return {
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: true,
    auth: { user, pass: password },
  };
}

export class GmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly user: string;
  private readonly to: string;

  constructor(config: GmailProviderConfig) {
    this.user = config.user;
    this.to = config.to;
    this.transporter = createTransport(gmailTransportOptions(config.user, config.password));
  }

  /** Builds the provider from the `.env` secrets plus the `emailTo` preference. */
  static fromEnv(options: GmailProviderFromEnvOptions = {}): GmailProvider {
    const user = requireEnv('SMTP_USER');
    return new GmailProvider({
      user,
      password: requireEnv('SMTP_PASSWORD'),
      to: options.to?.trim() || user,
    });
  }

  getFromAddress(): string {
    return mailFrom(this.user);
  }

  getRecipient(): string {
    return this.to;
  }

  async sendEmail({ subject, html }: SendEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: mailFrom(this.user),
      to: this.to,
      subject,
      html,
    });
  }
}
