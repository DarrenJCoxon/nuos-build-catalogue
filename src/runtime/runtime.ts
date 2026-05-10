/**
 * Build-catalogue NuFlow runtime factory.
 *
 * Wires the NuFlow runtime with stub memory adapters + the build-
 * catalogue MIS adapter + the build-catalogue workflow pack, ready to
 * accept the four flag-driven write commands of Phase H part 2.
 *
 * Memory adapters are stubs — the build catalogue's "memory" is the
 * JSON workflow store, not NuVector retrieval. The runtime's
 * `MemoryContextAdapter` and `WorkflowMemoryAdapter` are wired with
 * no-op implementations because the workflows in this pack do not
 * use them.
 */

import { createNuFlowRuntime, type NuFlowRuntime } from '@nusoft/nuflow';
import { nuosBuildCataloguePack } from '@nusoft/nuflow-pack-nuos-build-catalogue';

import type { WorkflowStore } from '../migrate/store.js';
import { createBuildCatalogueMisAdapter } from './mis-adapter.js';

export interface CreateBuildCatalogueRuntimeConfig {
  store: WorkflowStore;
  catalogueRoot: string;
}

export function createBuildCatalogueRuntime(
  config: CreateBuildCatalogueRuntimeConfig
): NuFlowRuntime {
  const runtime = createNuFlowRuntime({
    memoryContextAdapter: {
      retrieve: async () => ({
        items: [],
        retrievalId: `r_${Date.now()}`,
        retrievedAt: new Date().toISOString(),
        totalCandidates: 0,
      }),
    },
    workflowMemoryAdapter: {
      remember: async (record) => ({ ref: record.id }),
    },
    misWriteAdapter: createBuildCatalogueMisAdapter({
      store: config.store,
      catalogueRoot: config.catalogueRoot,
    }),
    policyGates: [],
    tenant: 'nuos-build-catalogue',
  });

  nuosBuildCataloguePack.register(runtime);

  return runtime;
}
