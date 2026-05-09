/**
 * NuVector store factory — opens the file-backed store at the configured
 * location, creating it if missing. The verification gate (scripts/
 * verify-persistence.ts) confirmed file-backed persistence works in
 * @nusoft/nuvector@0.1.0; see WU 110 notes for the verdict and known
 * API quirks.
 */

import { NuVector } from '@nusoft/nuvector';

export const TENANT = 'nuos_build_catalogue';

export interface StoreConfig {
  storagePath: string;
  dimensions: number;
}

export async function openStore(config: StoreConfig): Promise<NuVector> {
  return NuVector.open({
    storage: config.storagePath,
    dimensions: config.dimensions,
    tenant: TENANT,
  });
}
