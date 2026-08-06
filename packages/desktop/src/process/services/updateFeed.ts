/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GithubOptions } from 'builder-util-runtime';
import productConfig from '../../../../../ki-buddy-product.json';

const [owner, repo] = productConfig.updates.repository.split('/');

export type ProductFeedOptions = GithubOptions & { owner: string; repo: string };

export function buildProductFeedOptions(): ProductFeedOptions {
  if (!owner || !repo) throw new Error('Ki-Buddy update repository must use owner/repo format');
  return {
    provider: 'github',
    owner,
    repo,
    tagNamePrefix: productConfig.updates.tagPrefix,
  };
}
