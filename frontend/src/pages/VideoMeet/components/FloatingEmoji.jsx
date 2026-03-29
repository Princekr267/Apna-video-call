import React, { useEffect, useState } from 'react';

export default function FloatingEmoji({ emojis, onComplete }) {
    return (
        <div className="floating-emoji-container">
            {emojis.map((emoji) => (
                <EmojiItem
                    key={emoji.id}
                    emoji={emoji.emoji}
                    shouldRotate={emoji.shouldRotate}
                    id={emoji.id}
                    onComplete={() => onComplete(emoji.id)}
                />
            ))}
        </div>
    );
}

function EmojiItem({ emoji, shouldRotate, id, onComplete }) {
    const [style, setStyle] = useState({});

    useEffect(() => {
        // Random horizontal position (10% to 90% of screen width)
        const randomX = Math.random() * 80 + 10;
        // Random animation duration (3s to 5s)
        const randomDuration = Math.random() * 2 + 3;
        // Random rotation (only if shouldRotate is true)
        const randomRotate = shouldRotate ? Math.random() * 360 : 0;
        // Random slight horizontal drift
        const randomDrift = (Math.random() - 0.5) * 100;

        setStyle({
            left: `${randomX}%`,
            animationDuration: `${randomDuration}s`,
            '--drift': `${randomDrift}px`,
            '--rotate': `${randomRotate}deg`,
            '--should-rotate': shouldRotate ? '1' : '0'
        });

        // Remove emoji after animation completes
        const timer = setTimeout(() => {
            onComplete();
        }, randomDuration * 1000);

        return () => clearTimeout(timer);
    }, [id, onComplete, shouldRotate]);

    return (
        <div 
            className={`floating-emoji ${shouldRotate ? 'rotate' : 'no-rotate'}`} 
            style={style}
        >
            {emoji}
        </div>
    );
}
