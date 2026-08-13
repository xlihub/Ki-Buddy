import React from 'react';
import { useTranslation } from 'react-i18next';
import { KI_BUDDY_SUPPORTED_TOOLS } from './guideCast';
import ToolLogo from './ToolLogo';
import styles from './onboarding.module.css';

const ToolSupportStep: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.toolGrid}>
      {KI_BUDDY_SUPPORTED_TOOLS.map((tool) => (
        <ToolLogo key={tool} name={t(`login.kiBuddy.onboarding.tools.${tool}`)} />
      ))}
    </div>
  );
};

export default ToolSupportStep;
