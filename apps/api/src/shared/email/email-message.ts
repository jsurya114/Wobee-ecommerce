/**
 * A fully-rendered email, ready to hand to a transport. Framework-free and
 * dependency-free on purpose — this is the contract every template renderer
 * produces and every `MailerPort` implementation consumes, so neither side
 * ever needs to know about nodemailer (or any other library).
 */
export interface EmailMessage {
  /** A single recipient address — the transactional emails in this system are always 1:1 with a customer. */
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Always populated (clients that block HTML, accessibility, deliverability). */
  text: string;
}
