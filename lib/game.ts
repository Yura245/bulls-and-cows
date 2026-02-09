export function computeBullsAndCows(secret: string, guess: string): { bulls: number; cows: number } {
  let bulls = 0;
  let cows = 0;

  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guess[i]) {
      bulls += 1;
    } else if (secret.includes(guess[i])) {
      cows += 1;
    }
  }

  return { bulls, cows };
}

export function flipSeat(seat: number): 1 | 2 {
  return seat === 1 ? 2 : 1;
}
