import { Terminal } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AssistantAvatar from './AssistantAvatar';
import { KI_BUDDY_ASSISTANTS } from './guideCast';
import styles from './onboarding.module.css';

const AssistantFlowStep: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.flowStage}>
      <div className={styles.flowSource}>
        <Terminal theme='outline' size='24' />
        <span>{t('login.kiBuddy.onboarding.tools.aionCli')}</span>
      </div>
      <div className={styles.flowLine} aria-hidden='true' />
      <div className={styles.assistantGrid}>
        {KI_BUDDY_ASSISTANTS.map((assistant) => (
          <AssistantAvatar
            key={assistant}
            kind={assistant}
            label={t(`login.kiBuddy.onboarding.assistants.${assistant}`)}
          />
        ))}
      </div>
    </div>
  );
};

export default AssistantFlowStep;
