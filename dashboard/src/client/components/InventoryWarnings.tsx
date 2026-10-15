import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import type { InventoryWarning } from "../../shared/types";

/**
 * Notes from the workspace scan. Each one is a single row and its folders sit
 * behind a native disclosure, because a workspace with deep paths used to
 * produce one banner per folder and push the editor off screen.
 */
export function InventoryWarnings({
  warnings,
}: {
  warnings: InventoryWarning[];
}) {
  if (!warnings.length) return null;
  return (
    <div className="scan-warnings">
      {warnings.map((warning) => (
        <ScanWarning key={warning.code} warning={warning} />
      ))}
    </div>
  );
}

function ScanWarning({ warning }: { warning: InventoryWarning }) {
  const Icon = warning.level === "warning" ? AlertTriangle : Info;
  const label = (
    <>
      <Icon size={14} />
      <span className="scan-warning-text">{warning.message}</span>
    </>
  );
  const details = warning.details ?? [];
  if (!details.length)
    return <p className={`scan-warning ${warning.level}`}>{label}</p>;
  return (
    <details className={`scan-warning ${warning.level}`}>
      <summary>
        {label}
        <span className="scan-warning-count">
          {details.length + (warning.hidden ?? 0)} paths
        </span>
        <ChevronRight size={14} className="scan-warning-chevron" />
      </summary>
      <ul className="scan-warning-details">
        {details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
        {warning.hidden ? (
          <li className="more">and {warning.hidden} more</li>
        ) : null}
      </ul>
    </details>
  );
}
