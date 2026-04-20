import { useMemo } from 'react';

type Star = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  accent: boolean;
};

export default function StarField() {
  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: 220 }, (_, index) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 2.2 + 0.6,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 8}s`,
      accent: index % 17 === 0,
    }));
  }, []);

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((star, index) => (
        <span
          key={index}
          className={star.accent ? 'star star-accent' : 'star'}
          style={{
            left: star.left,
            top: star.top,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}