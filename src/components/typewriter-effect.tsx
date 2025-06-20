
"use client";

import React, { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";

interface TypewriterEffectProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
  loop?: boolean;
  loopDelay?: number;
}

export const TypewriterEffect: React.FC<TypewriterEffectProps> = ({
  text,
  speed = 70,
  className = "",
  onComplete,
  loop = false,
  loopDelay = 3000,
}) => {
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
  }, [text]); // Only reset if the core text changes

  useEffect(() => {
    if (!text || currentIndex >= text.length) {
      if (currentIndex >= text.length && !isComplete) {
        setIsComplete(true);
        if (onComplete) {
          onComplete();
        }
        if (loop) {
          const loopTimeoutId = setTimeout(() => {
            setDisplayedText('');
            setCurrentIndex(0);
            setIsComplete(false);
          }, loopDelay);
          // Cleanup function for the loop timeout
          return () => clearTimeout(loopTimeoutId);
        }
      }
      return; // Stop further processing if text is complete or no text
    }

    // Typing effect logic
    const timeoutId = setTimeout(() => {
      setDisplayedText((prev) => prev + text[currentIndex]);
      setCurrentIndex((prev) => prev + 1);
    }, speed);

    // Cleanup function for the typing timeout
    return () => clearTimeout(timeoutId);
  }, [text, currentIndex, speed, onComplete, isComplete, loop, loopDelay]);

  return (
    <div className={cn("font-mono text-base leading-relaxed", className)}>
      {displayedText}
      {!isComplete && <span className="animate-blink relative top-[-2px] ml-px">|</span>}
    </div>
  );
};
