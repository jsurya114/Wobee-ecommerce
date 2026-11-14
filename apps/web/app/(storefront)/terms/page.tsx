import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, MailLink, Strong, type LegalSection } from "@/features/legal/components/LegalPage";
import { LEGAL } from "@/features/legal/lib/legal-details";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The End User Licence Agreement and terms that apply when you use Woobe and buy from it.",
  alternates: { canonical: "/terms" },
};

/**
 * End User Licence Agreement / Terms of Use. Order, payment, cancellation and
 * return clauses mirror the real rules in apps/api (orders/cancel-order,
 * returns/resolve-return-eligibility's RETURN_WINDOW_DAYS = 7,
 * returns/calculate-return-refund-amount) and the Help Center copy in
 * HelpTopicContent.tsx — keep them in sync. Template text — needs legal review.
 */
const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    body: (
      <>
        <p>
          These Terms of Use, which also form our End User Licence Agreement (the &ldquo;Terms&rdquo;), are a binding agreement between you and{" "}
          <Strong>{LEGAL.entityName}</Strong> (&ldquo;Woobe&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), registered at {LEGAL.registeredAddress},
          India. They govern your use of {LEGAL.siteDomain}, any Woobe app, and every purchase you make through them (together, the
          &ldquo;Service&rdquo;).
        </p>
        <p>
          By browsing the Service, creating an account or placing an order, you agree to these Terms and to our{" "}
          <Link href="/privacy-policy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/cookie-policy" className="text-primary hover:underline">
            Cookie Policy
          </Link>
          . If you don&apos;t agree, please don&apos;t use the Service. These Terms are an electronic record under the Information Technology
          Act, 2000 and do not require a physical or digital signature.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    body: (
      <p>
        You must be at least 18 years old and able to enter into a binding contract under the Indian Contract Act, 1872 to buy from Woobe. If you
        are under 18, you may use the Service only under the supervision and with the consent of a parent or lawful guardian, who accepts these
        Terms on your behalf. The Service is currently offered for delivery within India only.
      </p>
    ),
  },
  {
    id: "licence",
    title: "Licence to use the Service",
    body: (
      <>
        <p>
          Subject to these Terms, we grant you a limited, personal, non-exclusive, non-transferable, revocable licence to access and use the
          Service for your own personal, non-commercial shopping. All rights not expressly granted are reserved by Woobe.
        </p>
        <p>You agree not to:</p>
        <LegalList>
          <li>copy, resell, sublicense or commercially exploit the Service or any of its content;</li>
          <li>scrape, crawl or harvest data from the Service by automated means, except search engines indexing public pages;</li>
          <li>reverse engineer, decompile or attempt to extract the source code of the Service, except to the extent the law allows;</li>
          <li>interfere with or disrupt the Service, its security or its servers, or try to gain unauthorised access to any account or system;</li>
          <li>use the Service for any fraudulent or unlawful purpose, or to buy products for resale in bulk without our written consent;</li>
          <li>upload or post anything that is unlawful, defamatory, obscene, infringing, or that violates rule 3(1)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.</li>
        </LegalList>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <p>
        You are responsible for the accuracy of the information you give us and for keeping your password confidential. You are responsible for
        activity under your account, so tell us straight away at <MailLink email={LEGAL.supportEmail} /> if you suspect unauthorised use. We may
        suspend or close accounts that breach these Terms or are used fraudulently. You may ask us to close your account at any time.
      </p>
    ),
  },
  {
    id: "products-pricing",
    title: "Products and pricing",
    body: (
      <>
        <LegalList>
          <li>
            Woobe sells surplus fashion. Many pieces are limited or one-of-a-kind; product availability is not guaranteed until your order is
            confirmed, and we do not promise restocks.
          </li>
          <li>
            Prices are calculated from each item&apos;s weight and our current rate per kilogram, and are shown in Indian Rupees (INR). The
            price, applicable GST and any delivery charge are shown before you pay. Prices can change at any time, but the price confirmed at
            checkout is the price you pay.
          </li>
          <li>
            We try to show colours, measurements and weights accurately, but actual products may vary slightly because of screens, lighting and
            the nature of surplus stock.
          </li>
          <li>
            If a product is listed at an obviously wrong price or description because of an error, we may cancel the order and refund any
            amount you paid in full.
          </li>
          <li>Coupons and offers are subject to their own conditions, cannot be exchanged for cash, and may be withdrawn at any time.</li>
        </LegalList>
      </>
    ),
  },
  {
    id: "orders-payment",
    title: "Orders and payment",
    body: (
      <>
        <p>
          Placing an order is an offer to buy. A contract is formed when we confirm your order. We may decline or cancel an order — for example,
          if an item is unavailable, payment is not verified, or we suspect fraud — and will refund any amount already paid.
        </p>
        <p>
          Online payments (cards, UPI, net banking, wallets) are processed by our payment gateway, Razorpay; your payment details go directly to
          it and are not stored by us. Where Cash on Delivery is offered, you pay the courier on delivery; for some Cash on Delivery orders the
          delivery fee must be paid online before the order is confirmed, and this is shown at checkout.
        </p>
      </>
    ),
  },
  {
    id: "shipping",
    title: "Shipping and delivery",
    body: (
      <p>
        We pack orders ourselves and hand them to courier partners for delivery to the address you provide. Delivery timelines shown are
        estimates, not guarantees. Tracking details appear under My Orders once available. Risk in the products passes to you on delivery.
        We offer open-box delivery: please check your items with the delivery partner before accepting the parcel.
      </p>
    ),
  },
  {
    id: "cancellations-returns",
    title: "Cancellations, returns and refunds",
    body: (
      <>
        <LegalList>
          <li>An order can be cancelled before it is packed. Once packed or shipped, it can no longer be cancelled.</li>
          <li>
            Whether returns are currently accepted is shown in our Help Center. When returns are open, they can be requested from My Orders
            within 7 days of delivery, choosing the item(s), quantity and reason, and each request is reviewed by our team, which may approve
            or reject it.
          </li>
          <li>
            Whether or not returns are open, if an item is damaged or not what you ordered, please don&apos;t accept it at the door, or contact
            support straight away.
          </li>
          <li>
            When a return is approved or a paid order is cancelled, we refund what you actually paid for the item(s) — the item price after any
            coupon discount, plus the tax charged on them. Delivery charges are not refunded.
          </li>
          <li>
            Online payments are refunded to the original payment method through our payment gateway. Refunds for Cash on Delivery orders are
            completed manually by our support team.
          </li>
        </LegalList>
        <p>
          Full details are in our{" "}
          <Link href="/account/help?topic=returns" className="text-primary hover:underline">
            Help Center
          </Link>
          . Nothing in these Terms limits your rights under the Consumer Protection Act, 2019.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Reviews and content you submit",
    body: (
      <p>
        If you submit reviews, testimonials, photos or other content, you confirm you have the right to do so, and you grant Woobe a
        non-exclusive, royalty-free, worldwide licence to use, display and adapt it in connection with the Service. We may moderate or remove
        content that breaches these Terms.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <p>
        The Woobe name, logo, website design, text, product photos, software and other content are owned by or licensed to Woobe and protected by
        Indian and international intellectual property laws. Third-party brand names on products belong to their respective owners; Woobe is
        not affiliated with or endorsed by them unless stated.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        The Service relies on third parties such as payment gateways, courier partners, Google Sign-In and WhatsApp. Your use of those services
        is also subject to their own terms. We are not responsible for their acts or omissions, though we will help you resolve issues relating
        to your order.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and limitation of liability",
    body: (
      <>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We work to keep it running and accurate but
          don&apos;t guarantee it will be uninterrupted or error-free.
        </p>
        <p>
          To the maximum extent permitted by law, Woobe will not be liable for any indirect, incidental, special or consequential loss, or loss
          of profit, data or goodwill, arising from your use of the Service. Our total liability for any claim relating to an order is limited to
          the amount you paid for that order. Nothing in these Terms excludes liability that cannot be excluded under Indian law, including under
          the Consumer Protection Act, 2019.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to indemnify Woobe against claims, losses and expenses (including reasonable legal fees) arising from your breach of these
        Terms or your misuse of the Service.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        We may suspend or end your access to the Service if you breach these Terms or the law, or if required to protect the Service or other
        users. Clauses that by their nature should survive termination — including intellectual property, liability, indemnity and governing
        law — will continue to apply.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of India. We encourage you to contact us first so we can try to resolve any dispute informally.
        Subject to your rights to approach a consumer commission under the Consumer Protection Act, 2019, the courts at {LEGAL.jurisdictionCity}
        , India will have exclusive jurisdiction.
      </p>
    ),
  },
  {
    id: "grievances",
    title: "Grievances and contact",
    body: (
      <>
        <p>
          Under the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Act, 2000, complaints can be sent to our
          Grievance Officer:
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
          We acknowledge complaints within 48 hours and aim to resolve them within one month. For anything else, write to{" "}
          <MailLink email={LEGAL.supportEmail} />.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these Terms from time to time. The updated version applies from the &ldquo;Last updated&rdquo; date shown above, and does
        not affect orders already confirmed. Continuing to use the Service after a change means you accept the updated Terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      current="/terms"
      sections={SECTIONS}
      intro={
        <p>
          Please read these terms carefully. They form the End User Licence Agreement for Woobe and explain your rights and ours when you use the
          site and buy from us.
        </p>
      }
    />
  );
}
