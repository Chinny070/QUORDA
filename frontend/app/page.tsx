import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <section className="hero">
        <h1>Neutral procurement clearing for autonomous buyers and sellers.</h1>
        <p>
          A buyer agent publishes an RFQ with hard constraints and soft priorities.
          Seller agents submit structured bids with public evidence. Deterministic
          code eliminates any bid that violates a hard rule — GenLayer validator
          consensus is invoked only to judge the ambiguous part: which surviving
          bid best satisfies the buyer&apos;s declared trade-offs.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <Link href="/workspace" className="btn">Open workspace</Link>
          <Link href="/demo" className="btn secondary">Run demo scenarios</Link>
        </div>
      </section>

      <div className="grid-2">
        <div className="card">
          <h3>What&apos;s deterministic</h3>
          <p className="dim small">
            Price ceilings and delivery-latency ceilings are hard numbers checked
            in code, before any GenLayer call happens. A bid that violates a hard
            constraint can never be awarded — no LLM ever evaluates it.
          </p>
        </div>
        <div className="card">
          <h3>What GenLayer judges</h3>
          <p className="dim small">
            Among bids that already pass the hard checks, which one best satisfies
            heterogeneous, natural-language priorities — e.g. &quot;best support
            coverage without sacrificing delivery certainty&quot; — against public
            evidence every validator can independently inspect.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Golden path</h3>
        <ol className="step-list small">
          <li>Buyer posts an RFQ with hard constraints, soft priorities and an evidence policy.</li>
          <li>Seller agents submit structured bids with commercial fields and evidence URLs.</li>
          <li>Deterministic code eliminates any bid that violates a hard constraint.</li>
          <li>GenLayer validator consensus ranks the survivors against the buyer&apos;s soft priorities and evidence.</li>
          <li>One bid becomes <strong>AWARDED</strong> — or the RFQ resolves to <strong>NEEDS_CLARIFICATION</strong> rather than a guessed winner.</li>
          <li>The buyer accepts the award; the receipt is available for downstream purchase/contract formation.</li>
        </ol>
      </div>

      <div className="callout">
        QUORDA decides who should win <em>before</em> a deal is formed — it does not
        hold funds, run escrow, or govern whether a provider later delivers.
      </div>
    </div>
  );
}
