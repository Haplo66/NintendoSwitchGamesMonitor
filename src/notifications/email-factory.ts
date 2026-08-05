import { EmailProviderKind } from '../models/settings';
import { EmailProvider } from './email-provider';
import { GmailProvider } from './gmail-provider';
import { MockEmailProvider } from './mock-email-provider';

export { EmailProviderKind };

export const DEFAULT_EMAIL_PROVIDER: EmailProviderKind = 'gmail';

export function resolveEmailProviderKind(kind?: EmailProviderKind | string): EmailProviderKind {
  const raw = kind ?? process.env.EMAIL_PROVIDER ?? DEFAULT_EMAIL_PROVIDER;
  const provider = raw.trim().toLowerCase() as EmailProviderKind;
  if (provider !== 'gmail' && provider !== 'mock') {
    throw new Error(`Unknown email provider: "${raw}"`);
  }
  return provider;
}

export function createEmailProvider(
  kind?: EmailProviderKind | string,
  options: { emailTo?: string } = {},
): EmailProvider {
  const selected = resolveEmailProviderKind(kind);

  switch (selected) {
    case 'mock':
      return new MockEmailProvider({ outDir: process.env.MOCK_EMAIL_OUT_DIR });
    case 'gmail':
      return GmailProvider.fromEnv({ to: options.emailTo });
    default:
      throw new Error(`Unknown email provider: "${selected}"`);
  }
}
