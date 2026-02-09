"use client";

type Props = {
  active: boolean;
};

export function ConfettiLayer({ active }: Props) {
  if (!active) {
    return null;
  }

  const pieces = new Array(36).fill(null).map((_, index) => ({
    id: index,
    left: (index * 19) % 100,
    delay: (index % 8) * 0.12,
    duration: 2.2 + (index % 5) * 0.25
  }));

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`
          }}
        />
      ))}
    </div>
  );
}
