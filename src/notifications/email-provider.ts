export interface SendEmailOptions {
  subject: string;
  html: string;
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<void>;
}
