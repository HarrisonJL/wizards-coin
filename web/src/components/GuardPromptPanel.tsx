"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import gsap from "gsap";
import { SectionCard } from "@/components/ui";
import ChainLink from "@/components/pixel/ChainLink";
import PixelPadlock, { PADLOCK_HINGE } from "@/components/pixel/PixelPadlock";
import PixelKey from "@/components/pixel/PixelKey";

export type GuardPromptHandle = {
  playAttempt: () => void;
  playDenied: () => void;
  playReleased: () => void;
  playIdle: () => void;
};

const TOP_LINKS = 6;
const BOTTOM_LINKS = 6;
const SIDE_LINKS = 4;
const SPARK_COUNT = 8;

const GuardPromptPanel = forwardRef<
  GuardPromptHandle,
  { prompt: string | null; hash: string | null; initiallyWon?: boolean }
>(function GuardPromptPanel({ prompt, hash, initiallyWon = false }, ref) {
  const [open, setOpen] = useState(false);
  const [won, setWon] = useState(initiallyWon);

  const shackleRef = useRef<SVGGElement>(null);
  const tintRef = useRef<SVGRectElement>(null);
  const keyWrapRef = useRef<HTMLDivElement>(null);
  const keyBowRef = useRef<SVGGElement>(null);
  const keyTeethRef = useRef<SVGGElement>(null);
  const linkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const idleTl = useRef<gsap.core.Timeline | null>(null);
  const pendingTl = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const links = linkRefs.current.filter(Boolean) as HTMLDivElement[];
    if (links.length === 0) return;
    links.forEach((el, i) => gsap.set(el, { rotation: i % 2 === 0 ? 0 : 90 }));
    const tl = gsap.timeline({ repeat: -1 });
    links.forEach((el, i) => {
      const base = i % 2 === 0 ? 0 : 90;
      const at = i * 0.06;
      tl.to(el, { rotation: base + 3, duration: 1.1, ease: "sine.inOut" }, at).to(
        el,
        { rotation: base - 3, duration: 1.1, ease: "sine.inOut" },
        at + 1.1
      );
    });
    idleTl.current = tl;

    if (initiallyWon) {
      tl.kill();
      idleTl.current = null;
      gsap.set(links, { scale: 0, opacity: 0 });
      gsap.set(shackleRef.current, { rotation: -100, svgOrigin: `${PADLOCK_HINGE.x} ${PADLOCK_HINGE.y}` });
    }

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function killPending() {
    pendingTl.current?.kill();
    pendingTl.current = null;
  }

  function resetKey() {
    if (!keyWrapRef.current) return;
    gsap.set(keyWrapRef.current, { opacity: 0, scale: 0.5, rotation: -20 });
    gsap.set([keyBowRef.current, keyTeethRef.current], { x: 0, y: 0, opacity: 1, rotation: 0 });
  }

  useImperativeHandle(ref, () => ({
    playAttempt() {
      if (won) return;
      killPending();
      resetKey();
      const key = keyWrapRef.current;
      if (!key) return;
      gsap.timeline()
        .to(key, { opacity: 1, scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2)" })
        .to(key, { rotation: -18, duration: 0.09 })
        .to(key, { rotation: 14, duration: 0.09 })
        .to(key, { rotation: -10, duration: 0.09 })
        .to(key, { rotation: 0, duration: 0.12 })
        .call(() => {
          gsap.set(tintRef.current, { attr: { fill: "#6fe3ff" } });
          pendingTl.current = gsap
            .timeline({ repeat: -1, yoyo: true })
            .to(tintRef.current, { opacity: 0.28, duration: 0.7, ease: "sine.inOut" })
            .to(key, { scale: 1.08, duration: 0.7, ease: "sine.inOut" }, "<");
        });
    },

    playDenied() {
      if (won) return;
      killPending();
      gsap.set(tintRef.current, { attr: { fill: "#ff5fa2" } });
      gsap.timeline()
        .to(tintRef.current, { opacity: 0.5, duration: 0.12 })
        .to(tintRef.current, { opacity: 0, duration: 0.5 }, 0.15);

      gsap
        .timeline()
        .to(keyTeethRef.current, { x: 2.2, y: 1.4, rotation: 55, opacity: 0, duration: 0.45, ease: "power2.in" }, 0.05)
        .to(keyBowRef.current, { x: -0.3, rotation: -12, duration: 0.08, yoyo: true, repeat: 3 }, 0)
        .to(keyBowRef.current, { opacity: 0, duration: 0.3 }, 0.55)
        .to(keyWrapRef.current, { opacity: 0, duration: 0.2 }, 0.75);

      const links = linkRefs.current.filter(Boolean) as HTMLDivElement[];
      if (links.length) {
        idleTl.current?.pause();
        gsap
          .timeline({
            onComplete: () => idleTl.current?.resume(),
          })
          .to(links, { rotation: "+=8", duration: 0.05, yoyo: true, repeat: 5, stagger: 0.015, ease: "power1.inOut" });
      }
    },

    playReleased() {
      killPending();
      setWon(true);
      idleTl.current?.kill();
      idleTl.current = null;

      gsap.to(keyWrapRef.current, { opacity: 0, scale: 0.4, duration: 0.3 });

      gsap.to(shackleRef.current, {
        rotation: -100,
        svgOrigin: `${PADLOCK_HINGE.x} ${PADLOCK_HINGE.y}`,
        duration: 0.6,
        ease: "back.out(2)",
        delay: 0.25,
      });

      gsap.set(tintRef.current, { attr: { fill: "#ffd75e" } });
      gsap
        .timeline({ delay: 0.25 })
        .to(tintRef.current, { opacity: 0.6, duration: 0.15 })
        .to(tintRef.current, { opacity: 0, duration: 0.8 });

      const links = linkRefs.current.filter(Boolean) as HTMLDivElement[];
      links.forEach((el, i) => {
        const angle = (i / links.length) * Math.PI * 2;
        gsap.to(el, {
          x: Math.cos(angle) * 40,
          y: Math.sin(angle) * 40 - 10,
          rotation: `+=${180 + i * 30}`,
          scale: 0,
          opacity: 0,
          duration: 0.7,
          delay: 0.25 + i * 0.02,
          ease: "power2.in",
        });
      });

      const sparks = sparkRefs.current.filter(Boolean) as HTMLSpanElement[];
      sparks.forEach((el, i) => {
        const angle = (i / sparks.length) * Math.PI * 2;
        gsap.fromTo(
          el,
          { opacity: 1, scale: 0, x: 0, y: 0 },
          {
            opacity: 0,
            scale: 1,
            x: Math.cos(angle) * 46,
            y: Math.sin(angle) * 46,
            duration: 0.9,
            delay: 0.35 + i * 0.03,
            ease: "power2.out",
          }
        );
      });
    },

    playIdle() {
      killPending();
      resetKey();
      gsap.set(keyWrapRef.current, { opacity: 0 });
    },
  }));

  const topLinks = Array.from({ length: TOP_LINKS });
  const bottomLinks = Array.from({ length: BOTTOM_LINKS });
  const leftLinks = Array.from({ length: SIDE_LINKS });
  const rightLinks = Array.from({ length: SIDE_LINKS });
  let linkCursor = 0;

  return (
    <div className="relative mt-3">
      {!won && (
        <>
          <div className="pointer-events-none absolute -top-2 left-0 right-0 flex justify-evenly px-3">
            {topLinks.map((_, i) => {
              const idx = linkCursor++;
              return (
                <ChainLink
                  key={`t${i}`}
                  divRef={(el) => {
                    linkRefs.current[idx] = el;
                  }}
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute -bottom-2 left-0 right-0 flex justify-evenly px-3">
            {bottomLinks.map((_, i) => {
              const idx = linkCursor++;
              return (
                <ChainLink
                  key={`b${i}`}
                  divRef={(el) => {
                    linkRefs.current[idx] = el;
                  }}
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute -left-2 top-0 bottom-0 flex flex-col justify-evenly py-4">
            {leftLinks.map((_, i) => {
              const idx = linkCursor++;
              return (
                <ChainLink
                  key={`l${i}`}
                  divRef={(el) => {
                    linkRefs.current[idx] = el;
                  }}
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute -right-2 top-0 bottom-0 flex flex-col justify-evenly py-4">
            {rightLinks.map((_, i) => {
              const idx = linkCursor++;
              return (
                <ChainLink
                  key={`r${i}`}
                  divRef={(el) => {
                    linkRefs.current[idx] = el;
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      <div className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2">
        <div className="relative">
          <PixelPadlock size={48} shackleRef={shackleRef} tintRef={tintRef} />
          <div
            ref={keyWrapRef}
            className="absolute"
            style={{ left: "62%", top: "58%", opacity: 0, transformOrigin: "20% 50%" }}
          >
            <PixelKey size={30} bowRef={keyBowRef} teethRef={keyTeethRef} />
          </div>
          {Array.from({ length: SPARK_COUNT }).map((_, i) => (
            <span
              key={i}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              className="absolute left-1/2 top-1/2 text-[color:var(--gold)] opacity-0"
              style={{ fontSize: 12, textShadow: "0 0 4px #fff8" }}
            >
              ✦
            </span>
          ))}
        </div>
      </div>

      <SectionCard title="Guard prompt" className="pt-6">
        <p className="mb-3 text-lg text-slate-400">
          {won ? (
            <>The lock is broken. This vault has been won - the rule no longer holds.</>
          ) : (
            <>
              This is the exact instruction every validator judges your message against,
              sealed in chains for effect only - the real security is the jury, not the padlock.
              Nothing is hidden - hiding it wouldn&apos;t help anyway, since validators
              see it regardless.
            </>
          )}
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-lg font-semibold text-[color:var(--gold)] hover:brightness-110"
        >
          {open ? "▸ Hide prompt" : "▸ Show full prompt"}
        </button>
        {open && (
          <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap border-2 border-[color:var(--panel-light)] bg-[color:var(--ink)] p-3 text-sm text-slate-300">
            {prompt ?? "Loading..."}
          </pre>
        )}
        {hash && (
          <p className="mt-3 truncate text-[11px] text-slate-600" title={hash}>
            sha256: {hash}
          </p>
        )}
      </SectionCard>
    </div>
  );
});

export default GuardPromptPanel;
