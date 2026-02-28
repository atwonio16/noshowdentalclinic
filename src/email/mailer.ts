import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logInfo, logWarn } from '../utils/logger';

export interface EmailSendInput {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  messageId?: string;
  status: string;
  raw?: unknown;
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  return cachedTransporter;
}

export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const transporter = getTransporter();

  if (!transporter) {
    logWarn('SMTP not configured; email not sent via provider. Logging payload only.', {
      to: input.to,
      subject: input.subject
    });

    logInfo('Email body', { body: input.text });
    return { status: 'logged' };
  }

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text
  });

  return {
    messageId: info.messageId,
    status: 'sent',
    raw: info
  };
}