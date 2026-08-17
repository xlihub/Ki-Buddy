import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InstallationIntegrityModalHost,
  getRuntimeComponentInstallationDescription,
} from '@/renderer/components/layout/InstallationIntegrityDialog';
import type { ProductBuiltinResourceState } from '@/common/platform/ki-buddy';
import { loadProductBuiltinMcpResourceState } from '@/renderer/hooks/mcp/catalog';
import { loadProductBuiltinAgentResourceState } from '@/renderer/services/runtime/kiBuddyAgentCatalog';

type KiBuddyProductIntegrityGateProps = {
  failure: string;
};

const PRODUCT_RESOURCE_VALIDATION_RETRY_MS = 1_000;

/** Blocks the business host when a recognized Ki-Buddy installation has an invalid packaged policy. */
const KiBuddyProductIntegrityGate: React.FC<KiBuddyProductIntegrityGateProps> = ({ failure }) => {
  const { t } = useTranslation();
  const description = t('login.kiBuddy.productExperience.invalidPolicyDescription');

  return (
    <div className='min-h-screen bg-bg-1'>
      <InstallationIntegrityModalHost
        description={description}
        diagnostics={{
          source: 'runtime_status',
          description,
          runtime: {
            failureKind: 'bundled_resource_invalid',
            message: failure,
            resource: 'product-experience-policy',
            scopeKind: 'application',
          },
        }}
      />
    </div>
  );
};

/** Validates product-owned resource requirements after Ki-Buddy authentication and catalog startup. */
export const KiBuddyProductResourceIntegrityGate: React.FC<PropsWithChildren<{ enabled: boolean }>> = ({
  children,
  enabled,
}) => {
  const { t } = useTranslation();
  const [resourceState, setResourceState] = useState<ProductBuiltinResourceState>({ status: 'pending', missing: [] });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let retryTimer: number | undefined;
    const validateResources = async (): Promise<void> => {
      const results = await Promise.allSettled([
        loadProductBuiltinAgentResourceState(),
        loadProductBuiltinMcpResourceState(),
      ]);
      if (!active) return;
      const labels = ['Agent', 'MCP'] as const;
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[Ki-Buddy] Failed to validate product ${labels[index]} resources:`, result.reason);
        }
      });
      const states = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      const missing = states.flatMap((state) => (state.status === 'invalid' ? state.missing : []));
      if (missing.length > 0) {
        setResourceState({ status: 'invalid', missing });
        return;
      }
      if (
        results.some((result) => result.status === 'rejected') ||
        states.some((state) => state.status === 'pending')
      ) {
        setResourceState({ status: 'pending', missing: [] });
        retryTimer = window.setTimeout((): void => {
          void validateResources();
        }, PRODUCT_RESOURCE_VALIDATION_RETRY_MS);
        return;
      }
      setResourceState({ status: 'ready', missing: [] });
    };
    void validateResources();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [enabled]);

  const missingResource = enabled && resourceState.status === 'invalid' ? resourceState.missing[0] : undefined;
  if (!missingResource) return children;

  const resourceLabel = missingResource.resourceName || missingResource.resourceId;
  const description = getRuntimeComponentInstallationDescription(t, resourceLabel);
  return (
    <>
      {children}
      <InstallationIntegrityModalHost
        closable
        description={description}
        diagnostics={{
          source: 'runtime_status',
          description,
          runtime: {
            failureKind: missingResource.code,
            message: missingResource.code,
            resource: `product-builtin-${missingResource.kind}`,
            resourceId: missingResource.resourceId,
            scopeKind: 'application',
          },
        }}
      />
    </>
  );
};

export default KiBuddyProductIntegrityGate;
