import React from 'react';
import { useTranslation } from 'react-i18next';
import { InstallationIntegrityModalHost } from '@/renderer/components/layout/InstallationIntegrityDialog';

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

export default KiBuddyProductIntegrityGate;
