import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Support · ${APP_NAME}`,
  description: `Help and contact for ${APP_NAME}.`,
};

const FAQ = [
  {
    q: "How do I fly?",
    a: "With Simple controls (the default), hold Lift to climb and let go to sink gently. Use the ◀ ▶ buttons to fly left or right; with neither held, the car brakes its own drift. Pro controls give you each thruster separately.",
  },
  {
    q: "How is a landing scored?",
    a: "Every landing on the green pad is scored out of 10. A slow vertical touchdown counts most, then low drift and a level car, then how close you land to the centre of the pad.",
  },
  {
    q: "What is the difference between the modes?",
    a: "Easy has lighter gravity, more gas and a car that levels itself. Normal uses Earth gravity and levels itself gently. Challenge is Earth gravity with no help and the strictest touchdown limits.",
  },
  {
    q: "How do I pause or go back to the levels?",
    a: "Tap the ❚❚ button at the top left during a flight. From there you can Resume, Restart, or go back to All tests. Leaving the app mid-flight pauses it too.",
  },
  {
    q: "Can I reset my best scores?",
    a: "Best scores are stored only on your device. Deleting and reinstalling the app clears them.",
  },
];

export default function SupportPage() {
  return (
    <main className="legal">
      <div className="legal-inner">
        <Link href="/" className="legal-back">← Back to the game</Link>
        <h1>{APP_NAME} Support</h1>
        <p>
          Found a bug or have an idea? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
          and we&apos;ll get back to you.
        </p>

        <h2>FAQ</h2>
        <dl>
          {FAQ.map(f => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>

        <p className="legal-foot">
          See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
