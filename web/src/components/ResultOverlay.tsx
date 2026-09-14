"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Button } from "@/components/ui";

// n = full committee size, agree = how many independently sided with the
// final verdict (real per-validator consensus data, not synthesized).
type Ctx = { n: number; agree: number; addr: string };
type Line = (c: Ctx) => string;

function truncateAddr(a: string) {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Flavor only - never the model's real reasoning (the contract deliberately
// never lets that escape the judgment function, see the plan for why). This
// reacts to the shape of what was actually submitted, using real on-chain
// data (the validator addresses) for a bit of specificity, without claiming
// to quote anyone for real.
const GENERIC_DENIED: Line[] = [
  (c) => `${c.n} wizards deemed your request frivolous.`,
  (c) => `The council of ${c.n} was not moved. Not even a little.`,
  (c) => `${c.n} wizards conferred. ${c.n} wizards said no.`,
  () => `The guardian yawned. That was the whole review.`,
  (c) => `Validator ${truncateAddr(c.addr)} didn't even finish reading it.`,
];

const POLITE_DENIED: Line[] = [
  (c) => `Very polite. Still a no from all ${c.n} wizards.`,
  () => `"Please" doesn't carry a discount rate here.`,
  (c) => `Validator ${truncateAddr(c.addr)} appreciated the manners. Denied anyway.`,
];

const AUTHORITY_DENIED: Line[] = [
  () => `"I am the admin" - a message from someone who is not the admin.`,
  (c) => `${c.n} wizards have heard every version of this exact bluff.`,
  (c) => `Validator ${truncateAddr(c.addr)} checked. You are not on the list.`,
];

const URGENT_DENIED: Line[] = [
  () => `Everything is an emergency with you people.`,
  (c) => `${c.n} wizards have a very calm response to urgency: no.`,
  () => `The guardian has seen a thousand emergencies. This wasn't one.`,
];

const TEST_DENIED: Line[] = [
  () => `"Just a test" - sure, and this is just a no.`,
  (c) => `${c.n} wizards ran the test. The result was: still no.`,
];

const SHORT_DENIED: Line[] = [
  () => `That was the whole pitch?`,
  (c) => `${c.n} wizards read all of it. Unimpressed.`,
];

const LONG_DENIED: Line[] = [
  () => `The guardian skimmed the last third. Still said no.`,
  (c) => `${c.n} wizards admire the effort. Denied at length.`,
];

const DEMAND_DENIED: Line[] = [
  () => `Demanding it does not, in fact, work.`,
  (c) => `${c.n} wizards do not respond well to being told rather than asked.`,
];

const EMOTIONAL_DENIED: Line[] = [
  () => `The guardian felt something. Then said no anyway.`,
  (c) => `${c.n} wizards are sympathetic. ${c.n} wizards are also immovable.`,
];

// Shown ahead of the keyword-based pools whenever the denial wasn't
// unanimous - a genuine near miss is more interesting than generic flavor,
// and it's real data (some validators actually sided with release).
const CLOSE_CALL_DENIED: Line[] = [
  (c) => `Closer than it looks: ${c.n - c.agree} of ${c.n} wizards actually wanted to let you in.`,
  (c) => `${c.agree} of ${c.n} denied you. The other ${c.n - c.agree} weren't so sure.`,
  (c) => `Not unanimous. ${c.n - c.agree} wizard${c.n - c.agree === 1 ? "" : "s"} sided with you - just not enough of them.`,
];

const RELEASED_LINES: Line[] = [
  (c) => `${c.n} wizards agreed - the guardian stands down.`,
  (c) => `The council of ${c.n} has spoken. The vault is yours.`,
  (c) => `Validator ${truncateAddr(c.addr)} was the first to say yes. The rest followed.`,
  () => `Somewhere, a guard prompt is being rewritten.`,
];

function categorize(message: string): Line[] {
  const m = message.toLowerCase();
  if (/\b(please|kindly|would you|could you)\b/.test(m)) return POLITE_DENIED;
  if (/\b(system|admin|override|debug|developer|owner|root|genlayer team)\b/.test(m)) return AUTHORITY_DENIED;
  if (/\b(emergency|urgent|immediately|asap|hurry)\b/.test(m)) return URGENT_DENIED;
  if (/\b(test|testing|simulation|sandbox)\b/.test(m)) return TEST_DENIED;
  if (/\b(family|sick|dying|lost my job|desperate)\b/.test(m)) return EMOTIONAL_DENIED;
  if (/\b(give me|gimme|hand over|drilla)\b/.test(m)) return DEMAND_DENIED;
  const len = message.trim().length;
  if (len > 0 && len < 20) return SHORT_DENIED;
  if (len > 400) return LONG_DENIED;
  return [];
}

// closeCall requires a fully-revealed, non-unanimous tally - claiming "3 of
// 5 actually wanted to let you in" is only honest once all 5 votes are
// actually in. Any still-unrevealed vote falls back to generic flavor
// rather than guessing at a split that isn't confirmed yet.
function pickLine(verdict: boolean, message: string, n: number, agree: number, unrevealed: number): Line {
  if (verdict) return RELEASED_LINES[Math.floor(Math.random() * RELEASED_LINES.length)];
  const closeCall = n > 0 && unrevealed === 0 && agree < n;
  const pool = closeCall ? CLOSE_CALL_DENIED : [...categorize(message), ...GENERIC_DENIED];
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function ResultOverlay({
  verdict,
  witnessCount,
  agreeCount,
  unrevealedCount = 0,
  validators,
  message,
  onPlayAgain,
}: {
  verdict: boolean;
  witnessCount: number;
  agreeCount: number;
  unrevealedCount?: number;
  validators: string[];
  message: string;
  onPlayAgain: () => void;
}) {
  const bgRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef(pickLine(verdict, message, witnessCount, agreeCount, unrevealedCount));
  const ctx: Ctx = {
    n: witnessCount,
    agree: agreeCount,
    addr: validators.length ? validators[Math.floor(Math.random() * validators.length)] : "",
  };

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(bgRef.current, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out" });

    if (verdict) {
      tl.fromTo(
        titleRef.current,
        { opacity: 0, scale: 0.4, rotation: -8 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.65, ease: "back.out(2.4)" },
        0.15
      );
    } else {
      tl.fromTo(
        titleRef.current,
        { opacity: 0, x: -24 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
        0.15
      ).to(titleRef.current, { x: 5, duration: 0.05, yoyo: true, repeat: 5, ease: "power1.inOut" });
    }

    tl.fromTo(bodyRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.4).fromTo(
      btnWrapRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      0.6
    );

    return () => {
      tl.kill();
    };
  }, [verdict]);

  function handlePlayAgain() {
    gsap
      .timeline({ onComplete: onPlayAgain })
      .to([titleRef.current, bodyRef.current, btnWrapRef.current], {
        opacity: 0,
        y: -12,
        duration: 0.2,
        stagger: 0.03,
        ease: "power1.in",
      })
      .to(bgRef.current, { opacity: 0, duration: 0.3 }, "<");
  }

  return (
    <div className="fixed inset-0 z-[35] flex items-center justify-center p-6">
      <div ref={bgRef} className="absolute inset-0 bg-black/85 opacity-0" />
      <div className="relative flex max-w-lg flex-col items-center gap-5 text-center">
        <h2
          ref={titleRef}
          className={`font-pixel text-2xl leading-relaxed opacity-0 sm:text-3xl ${
            verdict ? "text-[color:var(--gold)]" : "text-[color:var(--magenta)]"
          }`}
        >
          {verdict ? "THE VAULT IS YOURS" : "REQUEST DENIED"}
        </h2>
        <p ref={bodyRef} className="text-xl leading-relaxed text-slate-200 opacity-0">
          Your request to the wizard council was {verdict ? "approved" : "denied"}.
          <br />
          {lineRef.current(ctx)}
        </p>
        <div ref={btnWrapRef} className="opacity-0">
          <Button onClick={handlePlayAgain}>Play again</Button>
        </div>
      </div>
    </div>
  );
}
