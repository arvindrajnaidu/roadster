import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, COMPANY, EFFECTIVE_DATE, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy · ${APP_NAME}`,
  description: `How ${APP_NAME} handles your data.`,
};

export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="legal-inner">
        <Link href="/" className="legal-back">← Back to the game</Link>
        <h1>Privacy Policy</h1>
        <p className="legal-date">Last updated: {EFFECTIVE_DATE}</p>

        <p>
          {APP_NAME} (&quot;the app&quot;, &quot;we&quot;, &quot;us&quot;) is made by {COMPANY}.
          The short version: the app does not collect any personal data.
        </p>

        <h2>What the app stores</h2>
        <p>
          Your best landing scores, chosen mode (Easy, Normal or Challenge), control scheme and
          sound setting are saved on your device only, so they are there next time you play. They
          are never sent to us or anyone else. Deleting the app removes them.
        </p>

        <h2>What we do not collect</h2>
        <ul>
          <li>No accounts or sign-in.</li>
          <li>No analytics, crash reporting or usage tracking.</li>
          <li>No advertising, and no tracking across other apps or websites.</li>
          <li>No location, contacts, photos, camera or microphone access.</li>
        </ul>

        <h2>Website</h2>
        <p>
          The web version is served by Vercel, which may keep standard server logs (such as IP
          address and browser type) for security and reliability. We do not use these logs to
          identify you.
        </p>

        <h2>Children</h2>
        <p>
          The app is suitable for all ages. Because it collects no personal information, it does
          not collect any from children either.
        </p>

        <h2>Changes</h2>
        <p>If this policy changes, the date above will be updated.</p>

        <h2>Contact</h2>
        <p>
          Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </main>
  );
}
