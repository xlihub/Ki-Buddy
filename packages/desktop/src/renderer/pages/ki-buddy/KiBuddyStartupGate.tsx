import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import {
  hasSeenKiBuddyOpeningGuide,
  KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT,
  markKiBuddyOpeningGuideSeen,
  OpeningGuide,
} from './onboarding';

const KiBuddyStartupGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { status } = useAuth();
  const [showGuide, setShowGuide] = useState(() => !hasSeenKiBuddyOpeningGuide());

  useEffect(() => {
    const replay = () => setShowGuide(true);
    window.addEventListener(KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT, replay);
    return () => window.removeEventListener(KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT, replay);
  }, []);

  const finish = useCallback(() => {
    markKiBuddyOpeningGuideSeen();
    setShowGuide(false);
  }, []);

  if (status !== 'checking' && showGuide) {
    return <OpeningGuide onFinish={finish} />;
  }

  return children;
};

export default KiBuddyStartupGate;
