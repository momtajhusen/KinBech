import { FileText } from 'lucide-react';
import Modal from './Modal';

export default function RecordModal({ title, rows, onClose }) {
  if (!rows) return null;
  return (
    <Modal
      icon={FileText}
      title={title || 'Details'}
      size="sm"
      onClose={onClose}
      footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <dl className="record-modal-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
