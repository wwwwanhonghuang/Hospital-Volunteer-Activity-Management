// SPDX-License-Identifier: AGPL-3.0-only
const sourceUrl = import.meta.env.VITE_SOURCE_URL || 'https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management/tree/v1.2.0';

export default function SoftwareNotice() {
  return <span className="software-notice">
    <span>© 2026 HUANG WANHONG</span>
    <a href="/software-license.txt" target="_blank" rel="noreferrer">Software: AGPL-3.0</a>
    <a href={sourceUrl} target="_blank" rel="noreferrer">Source code</a>
    <span>No warranty</span>
  </span>;
}
