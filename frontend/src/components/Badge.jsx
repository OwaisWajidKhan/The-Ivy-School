import { statusColor, statusLabel } from '../lib/format';

export default function Badge({ status }) {
  return <span className={`badge capitalize ${statusColor(status)}`}>{statusLabel(status)}</span>;
}
