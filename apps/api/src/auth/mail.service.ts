import { Injectable, Logger } from '@nestjs/common';
import { isProduction } from '../common/env';

/**
 * The one job: get a short message to an address. When RESEND_API_KEY is set
 * the message goes through Resend's HTTPS API — one POST, no SDK. Without it,
 * development prints the message to the console (which is where a local reset
 * code is actually convenient to read), and production logs an error loud
 * enough to show up in monitoring, because a reset flow that silently eats
 * codes is worse than no reset flow.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  async send(to: string, subject: string, text: string): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      if (isProduction) {
        this.log.error(
          `RESEND_API_KEY unset — mail to ${to} ("${subject}") was not sent.`,
        );
      } else {
        this.log.log(`[dev mail] to=${to} subject="${subject}"\n${text}`);
      }
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? 'Priority <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      // The caller has already answered the HTTP request by the time this
      // runs; log with enough detail to chase, never with the message body.
      this.log.error(`Resend refused mail to ${to}: ${res.status} ${await res.text()}`);
    }
  }
}
