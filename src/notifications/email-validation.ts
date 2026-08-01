import 'dotenv/config';

import * as assert from 'node:assert';

import { NotificationReport } from '../models';
import { renderNotificationEmail } from './email-renderer';
import { MockEmailProvider } from './mock-email-provider';

function buildSampleReport(): NotificationReport {
  return {
    generatedAt: new Date().toISOString(),
    deals: [
      {
        title: 'Mario Kart 8 <script>alert("xss")</script> Deluxe',
        currentPrice: 39.99,
        previousPrice: 59.99,
        discountPercent: 33,
        ageRating: 'E',
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/?ref=test',
        reasons: ['Age appropriate for the family', 'Great for multiplayer & family nights'],
      },
    ],
    freeGames: [
      {
        title: 'Fortnite',
        ageRating: 'T',
        storeUrl: 'https://www.nintendo.com/store/products/fortnite/',
      },
    ],
  };
}

interface Check {
  name: string;
  run: () => void | Promise<void>;
}

async function runChecks(checks: Check[]): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${check.name}`);
      console.error(`    ${(error as Error).message}`);
    }
  }
  if (failed > 0) {
    throw new Error(`${failed} check(s) failed`);
  }
}

export async function validateEmailRendering(): Promise<void> {
  const report = buildSampleReport();
  const html = renderNotificationEmail(report);

  const deal = report.deals[0];
  const freeGame = report.freeGames[0];

  const checks: Check[] = [
    {
      name: 'HTML output is generated',
      run: () => {
        assert.ok(typeof html === 'string' && html.length > 0, 'HTML is empty');
        assert.ok(html.trim().startsWith('<!DOCTYPE html>'), 'Missing doctype');
        assert.ok(html.includes('<html'), 'Missing <html>');
        assert.ok(html.includes('</html>'), 'Missing </html>');
      },
    },
    {
      name: 'Header renders',
      run: () => {
        assert.ok(html.includes('Nintendo Switch Games Monitor'), 'Header title missing');
      },
    },
    {
      name: 'HTML escaping works',
      run: () => {
        assert.ok(html.includes('&lt;script&gt;'), 'Script tag was not escaped');
        assert.ok(html.includes('&quot;xss&quot;'), 'Quotes were not escaped');
        assert.ok(!html.includes('<script>'), 'Raw <script> leaked into output');
        assert.ok(html.includes('multiplayer &amp; family'), 'Ampersand was not escaped');
      },
    },
    {
      name: 'Deal section renders',
      run: () => {
        assert.ok(html.includes('Discounted Games'), 'Deal section header missing');
        assert.ok(html.includes('Mario Kart 8'), 'Deal title missing');
        assert.ok(html.includes('$59.99'), 'Previous price missing');
        assert.ok(html.includes('$39.99'), 'Current price missing');
        assert.ok(html.includes('-33%'), 'Discount percentage missing');
        assert.ok(html.includes('>E<'), 'Age rating missing');
        assert.ok(html.includes('Age appropriate for the family'), 'Reason missing');
        assert.ok(html.includes('Save $20.00'), 'Savings label missing');
      },
    },
    {
      name: 'Free game section renders',
      run: () => {
        assert.ok(html.includes('Free Games'), 'Free game section header missing');
        assert.ok(html.includes('Fortnite'), 'Free game title missing');
        assert.ok(html.includes('Free to download'), 'Free label missing');
      },
    },
    {
      name: 'Email buttons and links included',
      run: () => {
        assert.ok(html.includes('View Deal'), 'Deal button missing');
        assert.ok(html.includes('Get It Free'), 'Free game button missing');
        assert.ok(html.includes('href='), 'No links present');
        assert.ok(
          html.includes('https://www.nintendo.com/store/products/mario-kart-8-deluxe/'),
          'Deal URL missing',
        );
        assert.ok(
          html.includes('https://www.nintendo.com/store/products/fortnite/'),
          'Free game URL missing',
        );
      },
    },
    {
      name: 'Summary renders',
      run: () => {
        assert.ok(html.includes('Summary:'), 'Summary section missing');
        assert.ok(html.includes('1 discounted game'), 'Deal count incorrect');
        assert.ok(html.includes('1 free game'), 'Free game count incorrect');
      },
    },
    {
      name: 'Email can be captured by mock provider',
      run: async () => {
        const provider = new MockEmailProvider({ logToConsole: false });
        await provider.sendEmail({ subject: 'Test Subject', html });
        const last = provider.getLastEmail();
        assert.ok(last, 'Mock provider captured no email');
        assert.strictEqual(last.subject, 'Test Subject');
        assert.strictEqual(last.html, html);
        assert.strictEqual(provider.getSentEmails().length, 1);
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll email rendering checks passed.');
}

if (require.main === module) {
  validateEmailRendering().catch((error: unknown) => {
    console.error('Email validation failed:', error);
    process.exitCode = 1;
  });
}
