import { CheckOne, Robot } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KI_BUDDY_CAPABILITIES, KI_BUDDY_ROTATING_TOOLS } from './guideCast';
import styles from './onboarding.module.css';

const CapabilityStep: React.FC = () => {
  const { t } = useTranslation();
  const [toolIndex, setToolIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setToolIndex((current) => (current + 1) % KI_BUDDY_ROTATING_TOOLS.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.capabilityStage}>
      <div className={styles.capabilityHeader}>
        <span className={styles.assistantIcon} aria-hidden='true'>
          <Robot theme='outline' size='24' />
        </span>
        <div>
          <strong>{t('login.kiBuddy.onboarding.assistantProfile')}</strong>
          <span className={styles.rotatingTool}>
            {t(`login.kiBuddy.onboarding.tools.${KI_BUDDY_ROTATING_TOOLS[toolIndex]}`)}
          </span>
        </div>
      </div>
      <div className={styles.capabilityList}>
        {KI_BUDDY_CAPABILITIES.map((capability) => (
          <div key={capability} className={styles.capabilityItem}>
            <CheckOne theme='outline' size='16' aria-hidden='true' />
            <span>{t(`login.kiBuddy.onboarding.capabilities.${capability}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CapabilityStep;
