// SPDX-License-Identifier: AGPL-3.0-only
import { useId, useState } from 'react';
import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { downloadExcel, type ExcelExportRequest } from '../api';
import type { PageProps } from '../types';

type Props = {
  request: ExcelExportRequest;
  scope: string;
  notify: PageProps['notify'];
  label?: string;
  disabled?: boolean;
  className?: string;
};

export default function ExcelExportButton({ request, scope, notify, label = 'Export Excel', disabled = false, className = 'button button-secondary' }: Props) {
  const [busy, setBusy] = useState(false);
  const scopeId = useId();
  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadExcel({ ...request, scopeLabel: request.scopeLabel || scope });
      notify(`Excel workbook downloaded. ${scope}`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not download the Excel workbook.', 'error'); }
    finally { setBusy(false); }
  }
  return <button type="button" className={`${className} excel-export-button`} disabled={disabled || busy} aria-label={label} aria-describedby={scopeId} aria-busy={busy} onClick={() => void download()}>
    {busy ? <LoaderCircle size={16} className="spin" aria-hidden /> : <FileSpreadsheet size={16} aria-hidden />}
    <span className="excel-export-label">{busy ? 'Preparing workbook…' : label}<small id={scopeId}>{scope}</small></span>
  </button>;
}
