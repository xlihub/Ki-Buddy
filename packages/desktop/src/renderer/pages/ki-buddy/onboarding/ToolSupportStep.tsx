import React from 'react';
import { KI_BUDDY_SUPPORTED_TOOLS } from './guideCast';
import ToolLogo from './ToolLogo';
import styles from './onboarding.module.css';

const ToolSupportStep: React.FC = () => (
  <div className={styles.toolGrid}>
    {KI_BUDDY_SUPPORTED_TOOLS.map((tool) => (
      <ToolLogo key={tool} name={tool} />
    ))}
  </div>
);

export default ToolSupportStep;
