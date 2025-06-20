
"use client";

import React, { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";

interface TypewriterEffectProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export const TypewriterEffect: React.FC<TypewriterEffectProps> = ({ text, speed = 70, className = "", onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      setCurrentIndex(0);
      setIsComplete(false);
      return;
    }
    // Reset on text change or component mount if text is present
    setDisplayedText('');
    setCurrentIndex(0);
    setIsComplete(false);
  }, [text]);

  useEffect(() => {
    if (!text || currentIndex >= text.length) {
      if (currentIndex >= text.length && !isComplete) {
        setIsComplete(true);
        if (onComplete) {
          onComplete();
        }
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      setDisplayedText((prev) => prev + text[currentIndex]);
      setCurrentIndex((prev) => prev + 1);
    }, speed);

    return () => clearTimeout(timeoutId);
  }, [text, currentIndex, speed, onComplete, isComplete]);

  return (
    <div className={cn("font-mono text-base leading-relaxed", className)}>
      {displayedText}
      {!isComplete && <span className="animate-blink relative top-[-2px] ml-px">|</span>}
    </div>
  );
};
