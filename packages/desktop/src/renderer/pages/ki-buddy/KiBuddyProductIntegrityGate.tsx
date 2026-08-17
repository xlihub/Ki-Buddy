import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InstallationIntegrityModalHost,
  getRuntimeComponentInstallationDescription,
} from '@/renderer/components/layout/InstallationIntegrityDialog';
import type { ProductBuiltinResourceState } from '@/common/platform/ki-buddy';
import { loadProductBuiltinMcpResourceState } from '@/renderer/hooks/mcp/catalog';

type KiBuddyProductIntegrityGateProps = {
  failure: string;
};

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

/** Validates product-owned MCP requirements after Ki-Buddy authentication and catalog startup. */
export const KiBuddyMcpProductIntegrityGate: React.FC<PropsWithChildren<{ enabled: boolean }>> = ({
  children,
  enabled,
}) => {
  const { t } = useTranslation();
  const [resourceState, setResourceState] = useState<ProductBuiltinResourceState>({ status: 'pending', missing: [] });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadProductBuiltinMcpResourceState()
      .then((state) => {
        if (active) setResourceState(state);
      })
      .catch((error) => {
        console.error('[Ki-Buddy] Failed to validate product MCP resources:', error);
      });
    return () => {
      active = false;
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
            resource: 'product-builtin-mcp',
            resourceId: missingResource.resourceId,
            scopeKind: 'application',
          },
        }}
      />
    </>
  );
};

export default KiBuddyProductIntegrityGate;
