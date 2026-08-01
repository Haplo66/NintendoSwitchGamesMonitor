import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailProvider, SendEmailOptions } from './email-provider';

export interface GmailProviderConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  to: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export class GmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly user: string;
  private readonly to: string;

  constructor(config: GmailProviderConfig) {
    this.user = config.user;
    this.to = config.to;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  static fromEnv(): GmailProvider {
    return new GmailProvider({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      user: requireEnv('SMTP_USER'),
      password: requireEnv('SMTP_PASSWORD'),
      to: requireEnv('EMAIL_TO'),
    });
  }

  async sendEmail({ subject, html }: SendEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: `"Nintendo Switch Games Monitor" <${this.user}>`,
      to: this.to,
      subject,
      html,
    });
  }
}
