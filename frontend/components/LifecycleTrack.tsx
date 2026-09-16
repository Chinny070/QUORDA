import type { WriteLifecycleState } from "@/lib/genlayer/contract";

const STEPS: { key: WriteLifecycleState; label: string }[] = [
  { key: "estimating-fees", label: "Estimating fees" },
  { key: "awaiting-wallet-approval", label: "Awaiting wallet approval" },
  { key: "submitted", label: "Submitted" },
  { key: "pending-consensus", label: "Pending validator consensus" },
  { key: "decided", label: "Decided" },
  { key: "finalized", label: "Finalized" },
];

/** Truthful, step-by-step lifecycle indicator - never claims success
 * immediately after submission (TRD "Frontend Transaction States"). */
export function LifecycleTrack({
  current,
  failed,
}: {
  current: WriteLifecycleState | null;
  failed?: boolean;
}) {
  const currentIndex = current ? STEPS.findIndex((s) => s.key === current) : -1;

  return (
    <div className="lifecycle-track" role="status" aria-live="polite">
      {STEPS.map((step, i) => {
        let cls = "lifecycle-step";
        if (failed && i === currentIndex) cls += " failed";
        else if (i < currentIndex || (i === currentIndex && current === "finalized")) cls += " done";
        else if (i === currentIndex) cls += " active";
        return (
          <span key={step.key} className={cls}>
            {step.label}
          </span>
        );
      })}
    </div>
  );
}
