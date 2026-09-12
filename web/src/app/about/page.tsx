import { SectionCard } from "@/components/ui";

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-pixel text-lg leading-relaxed text-[color:var(--gold)]">
        Why this is different from the usual AI vault
      </h1>

      <SectionCard>
        <p className="text-sm leading-relaxed text-slate-300">
          Games like this usually work the same way: one operator runs one AI
          model behind one prompt, and it decides whether to pay out. That
          means you have to trust the operator isn&apos;t quietly rigging it,
          patching the prompt after the fact, or just not paying out when
          someone wins.
        </p>
      </SectionCard>

      <SectionCard title="What GenLayer changes">
        <p className="text-sm leading-relaxed text-slate-300">
          This vault is a GenLayer Intelligent Contract. There is no single
          operator judging your attempt - a committee of independent
          validators, each running its own model, judges it separately. A
          payout only happens if a majority of them agree the vault should
          release. Nobody, including whoever deployed this contract, can
          unilaterally decide an attempt succeeded.
        </p>
      </SectionCard>

      <SectionCard title="Is it actually unbreakable?">
        <p className="text-sm leading-relaxed text-slate-300">
          No - and we&apos;re not claiming that. The guard prompt is
          instructed to never release the vault under any circumstances, but
          that&apos;s a prompt-level instruction, not a mathematical
          guarantee. What changes is the bar: a jailbreak has to convince a
          majority of an independent, model-diverse jury at once, not just
          find one weak spot in one model. That&apos;s hard and nobody&apos;s
          thumb is on the scale - not &quot;impossible.&quot;
        </p>
      </SectionCard>

      <SectionCard title="Testnet only">
        <p className="text-sm leading-relaxed text-slate-300">
          This runs on GenLayer&apos;s public testnet. GEN has no real-world
          value here. Consensus on an LLM-judged call is slow and would be
          expensive on a production network - that&apos;s expected, not a
          bug.
        </p>
      </SectionCard>
    </div>
  );
}
