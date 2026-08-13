import { DashboardOne, FilePpt, FileWord, Robot, TableFile, Write } from '@icon-park/react';
import React from 'react';
import styles from './onboarding.module.css';

const ASSISTANT_ICONS = {
  manager: Robot,
  word: FileWord,
  slides: FilePpt,
  sheets: TableFile,
  board: DashboardOne,
  research: Write,
} as const;

type AssistantAvatarProps = {
  kind: keyof typeof ASSISTANT_ICONS;
  label: string;
};

const AssistantAvatar: React.FC<AssistantAvatarProps> = ({ kind, label }) => {
  const Icon = ASSISTANT_ICONS[kind];
  return (
    <div className={styles.assistantAvatar}>
      <span className={styles.assistantIcon} aria-hidden='true'>
        <Icon theme='outline' size='22' />
      </span>
      <span>{label}</span>
    </div>
  );
};

export default AssistantAvatar;
