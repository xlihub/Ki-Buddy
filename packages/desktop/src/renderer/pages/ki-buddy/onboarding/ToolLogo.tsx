import { Terminal } from '@icon-park/react';
import React from 'react';
import styles from './onboarding.module.css';

type ToolLogoProps = {
  name: string;
};

const ToolLogo: React.FC<ToolLogoProps> = ({ name }) => (
  <div className={styles.toolLogo} aria-label={name}>
    <span className={styles.toolIcon} aria-hidden='true'>
      <Terminal theme='outline' size='18' />
    </span>
    <span>{name}</span>
  </div>
);

export default ToolLogo;
