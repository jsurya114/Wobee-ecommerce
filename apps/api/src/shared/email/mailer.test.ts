import type { Transporter } from "nodemailer";
import { describe, expect, it, vi } from "vitest";
import { DevMailer } from "./dev-mailer";
import { NodemailerMailer } from "./nodemailer-mailer";

describe("NodemailerMailer", () => {
  it("maps EmailMessage fields onto transport.sendMail and includes a from address", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "x" });
    const fakeTransport = { sendMail } as unknown as Transporter;
    const mailer = new NodemailerMailer(fakeTransport);

    await mailer.send({ to: "c@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0]![0];
    expect(arg).toMatchObject({ to: "c@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    expect(typeof arg.from).toBe("string");
    expect(arg.from.length).toBeGreaterThan(0);
  });

  it("propagates a transport failure (so callers/BullMQ can react)", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP 421"));
    const mailer = new NodemailerMailer({ sendMail } as unknown as Transporter);
    await expect(mailer.send({ to: "c@example.com", subject: "s", html: "h", text: "t" })).rejects.toThrow("SMTP 421");
  });
});

describe("DevMailer", () => {
  it("resolves without throwing and never logs the body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mailer = new DevMailer();
    await expect(mailer.send({ to: "c@example.com", subject: "Subj", html: "<p>secret 4821</p>", text: "secret 4821" })).resolves.toBeUndefined();
    // In the test env DevMailer is silent; if it ever logs, it must not include the body.
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain("4821");
    }
    warn.mockRestore();
  });
});
