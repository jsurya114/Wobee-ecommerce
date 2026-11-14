import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, MailLink, Strong, type LegalSection } from "@/features/legal/components/LegalPage";
import { LEGAL } from "@/features/legal/lib/legal-details";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Woobe collects, uses, shares and protects your personal data under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/privacy-policy" },
};

/**
 * Static legal page — every data point below is grounded in what the code
 * actually stores (packages/database schema: User, Address, Order, Payment,
 * Return, AnalyticsEvent, RefreshToken), the cookies apps/api sets, and the
 * third parties it calls (Razorpay, Google Sign-In, SMTP email, AWS, Vercel).
 * Update it when any of those change. Template text — needs legal review.
 */
const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.siteDomain} (&ldquo;Woobe&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by <Strong>{LEGAL.entityName}</Strong>, with its
          registered office at {LEGAL.registeredAddress}, India. For the purposes of the Digital Personal Data Protection Act, 2023
          (&ldquo;DPDP Act&rdquo;), we are the <Strong>Data Fiduciary</Strong> for the personal data described in this policy.
        </p>
        <p>
          This policy explains what personal data we collect when you browse Woobe, create an account, place an order or contact us, why we
          collect it, who we share it with, and the rights you have over it. It should be read together with our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/cookie-policy" className="text-primary hover:underline">
            Cookie Policy
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Personal data we collect",
    body: (
      <>
        <p>We only collect what we need to run the store:</p>
        <LegalList>
          <li>
            <Strong>Account details</Strong> — your name, email address, optional mobile number and a password. Passwords are stored only as a
            salted one-way hash; we never see or keep the password itself. If you sign in with Google, we receive your name and email address
            from Google, verified through Google&apos;s sign-in token.
          </li>
          <li>
            <Strong>Verification codes</Strong> — when you register or reset your password we email you a one-time code. We store only a hashed
            form of the code, and only until it is used or expires.
          </li>
          <li>
            <Strong>Delivery details</Strong> — the name, phone number and address (address lines, city, state, PIN code) you save or enter at
            checkout, including for guest checkout.
          </li>
          <li>
            <Strong>Orders and returns</Strong> — what you bought, prices, taxes, coupons applied, payment method (online or Cash on Delivery),
            order and shipment status, courier tracking details, and any return requests with the reason you give.
          </li>
          <li>
            <Strong>Payment records</Strong> — the amount, status and the reference IDs our payment gateway returns. Card, UPI, net-banking and
            wallet details are entered directly on the payment gateway&apos;s secure checkout; <Strong>we do not receive or store your card
            number, CVV, UPI PIN or bank credentials</Strong>.
          </li>
          <li>
            <Strong>Your bag and wishlist</Strong> — items you add, so they are still there when you come back.
          </li>
          <li>
            <Strong>Reviews</Strong> — testimonials or reviews you choose to submit, which may be shown on the site with your name.
          </li>
          <li>
            <Strong>Messages to us</Strong> — anything you send us by email or WhatsApp when you ask for help.
          </li>
          <li>
            <Strong>Shopping activity (anonymous)</Strong> — a small set of events (visit started, product viewed, added to bag, checkout started)
            tied to a random ID that lives only for your browser tab session. It contains no name, email or device fingerprint, and if your
            browser sends a &ldquo;Do Not Track&rdquo; signal we don&apos;t record it at all. If you place an order, the order is linked to that
            session so we can understand which visits lead to purchases.
          </li>
          <li>
            <Strong>Technical data</Strong> — like any website, our servers and hosting providers process your IP address, browser type and
            request details to deliver pages, keep the service secure and prevent abuse (for example, rate-limiting repeated login attempts).
          </li>
        </LegalList>
        <p>
          We do not knowingly collect sensitive data such as health, financial account or biometric information, and we don&apos;t buy personal
          data from third parties.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "Why we use it (purpose and legal basis)",
    body: (
      <>
        <p>
          Under the DPDP Act we process your personal data either with your <Strong>consent</Strong>, which you give by creating an account,
          placing an order or contacting us, or for a <Strong>legitimate use</Strong> the Act allows, such as complying with law. We use it to:
        </p>
        <LegalList>
          <li>create and secure your account, and keep you signed in;</li>
          <li>process, pack, ship and deliver your orders, and handle cancellations, returns and refunds;</li>
          <li>take payments and verify them with our payment gateway;</li>
          <li>send transactional emails — verification codes, password resets, order confirmations and status updates;</li>
          <li>answer your questions and resolve complaints;</li>
          <li>understand, in aggregate, how the store is used so we can improve it;</li>
          <li>detect and prevent fraud, abuse and security incidents;</li>
          <li>meet our obligations under Indian tax, accounting, consumer protection and other laws.</li>
        </LegalList>
        <p>
          We do not sell your personal data, and we don&apos;t use it for advertising profiles. If we start sending marketing emails, we will
          ask for your separate consent first and every such email will let you unsubscribe.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We share personal data only with service providers that help us run Woobe, and only what each one needs:</p>
        <LegalList>
          <li>
            <Strong>Razorpay</Strong> (payment gateway) — your order amount and the details you enter on its checkout, to take and refund online
            payments. Razorpay processes your payment information under its own privacy policy and PCI-DSS obligations.
          </li>
          <li>
            <Strong>Courier and logistics partners</Strong> — your name, phone number and delivery address, to deliver your order and, for Cash on
            Delivery, to collect payment.
          </li>
          <li>
            <Strong>Google</Strong> — only if you choose &ldquo;Continue with Google&rdquo;; Google confirms your identity to us.
          </li>
          <li>
            <Strong>Email delivery provider</Strong> — your email address and the message content, to deliver transactional emails.
          </li>
          <li>
            <Strong>Hosting and infrastructure</Strong> — Amazon Web Services (our servers, database and product images, hosted in India) and
            Vercel (which serves the storefront website through its global network).
          </li>
          <li>
            <Strong>WhatsApp (Meta)</Strong> — only if you choose to message us on WhatsApp.
          </li>
        </LegalList>
        <p>
          We may also disclose personal data where required by law, a court order or a lawful request from a government authority, or to
          protect the rights, property or safety of Woobe, our customers or others. If Woobe is merged or sold, personal data may transfer to
          the new owner, who will remain bound by this policy.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where your data is stored",
    body: (
      <p>
        Our application servers, database and image storage are hosted in India (AWS Asia Pacific — Hyderabad region). Some providers, such as
        our website host, email provider and Google, may process data on servers outside India. Any such transfer is made in line with the DPDP
        Act and to countries not restricted by the Government of India.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <LegalList>
        <li>Account details: for as long as your account is active. When you ask us to delete your account, we erase or anonymise your personal data, except what we must keep by law.</li>
        <li>Order, invoice and payment records: for the period required by Indian tax and accounting laws (generally up to 8 years), after which they are deleted or anonymised.</li>
        <li>Sign-in sessions: up to 30 days unless you log out sooner.</li>
        <li>Verification and password-reset codes: only until used or expired.</li>
        <li>Anonymous shopping-activity events: kept in aggregate for analytics; they do not identify you.</li>
        <li>Support messages: as long as needed to resolve your request and any follow-up.</li>
      </LegalList>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <>
        <p>We take reasonable security practices and procedures, as required by the Information Technology Act, 2000 and its rules, including:</p>
        <LegalList>
          <li>encryption in transit (HTTPS) for all traffic to the site and our API;</li>
          <li>hashed passwords and one-time codes, and sign-in cookies that scripts on the page cannot read;</li>
          <li>short-lived access tokens held only in memory, with rotating refresh tokens that are revoked on logout or suspected misuse;</li>
          <li>role-based access for our staff, and audit logs of administrative actions;</li>
          <li>no storage of card or bank credentials on our systems.</li>
        </LegalList>
        <p>
          No system is perfectly secure. If a personal data breach occurs, we will inform affected users and the Data Protection Board of India
          as the DPDP Act requires.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the DPDP Act you have the right to:</p>
        <LegalList>
          <li>
            <Strong>Access</Strong> a summary of the personal data we hold about you and how we process it, and the identities of those we have
            shared it with;
          </li>
          <li>
            <Strong>Correct, complete or update</Strong> it — most details can be changed yourself under My Account (profile and addresses);
          </li>
          <li>
            <Strong>Erase</Strong> it, subject to records we are legally required to keep;
          </li>
          <li>
            <Strong>Withdraw consent</Strong> at any time — this won&apos;t affect processing already done, but we may not be able to provide
            services that depend on it;
          </li>
          <li>
            <Strong>Grievance redressal</Strong> — to have complaints about our handling of your data resolved by us;
          </li>
          <li>
            <Strong>Nominate</Strong> another person to exercise these rights on your behalf in case of death or incapacity.
          </li>
        </LegalList>
        <p>
          To exercise any of these rights, email <MailLink email={LEGAL.supportEmail} /> or our Grievance Officer (below) from the email address
          on your account. We may need to verify your identity before acting on a request. If you are not satisfied with our response, you may
          complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Woobe is intended for adults. If you are under 18, you may use Woobe only with the involvement and verifiable consent of a parent or
        lawful guardian. We do not knowingly process children&apos;s personal data without such consent, and we do not track or target
        advertising at children. If you believe a child has given us personal data without consent, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    body: (
      <p>
        We use a small number of strictly necessary cookies and browser storage to keep you signed in, remember your bag and run checkout. We
        do not use advertising or third-party tracking cookies. See our{" "}
        <Link href="/cookie-policy" className="text-primary hover:underline">
          Cookie Policy
        </Link>{" "}
        for the full list.
      </p>
    ),
  },
  {
    id: "grievance-officer",
    title: "Grievance Officer and contact",
    body: (
      <>
        <p>
          In accordance with the Information Technology Act, 2000, the rules made under it, the DPDP Act and the Consumer Protection
          (E-Commerce) Rules, 2020, our Grievance Officer is:
        </p>
        <p className="rounded-card border border-border bg-surface p-4 text-text-primary">
          {LEGAL.grievanceOfficerName}
          <br />
          {LEGAL.entityName}
          <br />
          {LEGAL.registeredAddress}
          <br />
          Email: <MailLink email={LEGAL.grievanceOfficerEmail} />
        </p>
        <p>
          We acknowledge complaints within 48 hours and aim to resolve them within one month of receipt. For general questions, write to{" "}
          <MailLink email={LEGAL.supportEmail} />.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as our services or the law change. The &ldquo;Last updated&rdquo; date at the top shows when it was last
        revised. For significant changes we will notify you by email or on the site before they take effect.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      current="/privacy-policy"
      sections={SECTIONS}
      intro={
        <p>
          Your privacy matters to us. This policy describes how Woobe handles your personal data in line with the Digital Personal Data
          Protection Act, 2023, the Information Technology Act, 2000 and the rules made under them.
        </p>
      }
    />
  );
}
