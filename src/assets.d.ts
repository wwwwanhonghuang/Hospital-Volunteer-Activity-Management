// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="vite/client" />
declare module '*.json?url' {
  const url: string;
  export default url;
}
