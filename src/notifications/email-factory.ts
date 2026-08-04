import { EmailProvider } from './email-provider';
import { GmailProvider } from './gmail-provider';
import { MockEmailProvider } from './mock-email-provider';

export type EmailProviderKind = 'gmail' | 'mock';

export const DEFAULT_EMAIL_PROVIDER: EmailProviderKind = 'gmail';

export function resolveEmailProviderKind(kind?: EmailProviderKind | string): EmailProviderKind {
  return (kind ?? process.env.EMAIL_PROVIDER ?? DEFAULT_EMAIL_PROVIDER).toLowerCase() as EmailProviderKind;
}

export function createEmailProvider(kind?: EmailProviderKind | string): EmailProvider {
  const selected = resolveEmailProviderKind(kind);

  switch (selected) {
    case 'mock':
      return new MockEmailProvider({ outDir: process.env.MOCK_EMAIL_OUT_DIR });
    case 'gmail':
      return GmailProvider.fromEnv();
    default:
      throw new Error(`Unknown email provider: "${selected}"`);
  }
}
