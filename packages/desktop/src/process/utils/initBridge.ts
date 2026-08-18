/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initAllBridges, type BridgeDependencies } from '../bridge';

/** Registers main-process IPC providers for the selected product experience. */
export default function initBridge(dependencies: BridgeDependencies): void {
  initAllBridges(dependencies);
}
