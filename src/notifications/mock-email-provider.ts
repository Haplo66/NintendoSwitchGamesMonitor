import * as fs from 'node:fs';
import * as path from 'node:path';
import { EmailProvider, SendEmailOptions } from './email-provider';

export interface MockEmail {
  id: string;
  sentAt: string;
  subject: string;
  html: string;
}

export interface MockEmailProviderOptions {
  outDir?: string;
  logToConsole?: boolean;
}

export class MockEmailProvider implements EmailProvider {
  private readonly outDir?: string;
  private readonly logToConsole: boolean;
  private readonly emails: MockEmail[] = [];

  constructor(options: MockEmailProviderOptions = {}) {
    this.outDir = options.outDir;
    this.logToConsole = options.logToConsole ?? true;
  }

  async sendEmail({ subject, html }: SendEmailOptions): Promise<void> {
    const record: MockEmail = {
      id: `${Date.now()}-${this.emails.length + 1}`,
      sentAt: new Date().toISOString(),
      subject,
      html,
    };
    this.emails.push(record);

    if (this.logToConsole) {
      console.log(
        `[mock-email] id=${record.id} subject="${record.subject}" htmlBytes=${Buffer.byteLength(record.html)}`,
      );
    }

    if (this.outDir) {
      fs.mkdirSync(this.outDir, { recursive: true });
      fs.writeFileSync(path.join(this.outDir, `email-${record.id}.html`), record.html, 'utf8');
    }
  }

  getSentEmails(): MockEmail[] {
    return this.emails;
  }

  getLastEmail(): MockEmail | undefined {
    return this.emails[this.emails.length - 1];
  }

  reset(): void {
    this.emails.length = 0;
  }
}
