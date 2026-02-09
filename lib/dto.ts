import type { GameStatus, RoomStatus } from "@/lib/constants";

export type RoomPlayerDto = {
  seat: 1 | 2;
  name: string;
  online: boolean;
};

export type GuessDto = {
  turnNo: number;
  guesserSeat: 1 | 2;
  guess: string;
  bulls: number;
  cows: number;
  createdAt: string;
};

export type GameDto = {
  id: string;
  roundNo: number;
  status: GameStatus;
  turnSeat: 1 | 2 | null;
  winnerSeat: 1 | 2 | null;
  mySeat: 1 | 2;
  mySecretSet: boolean;
  opponentSecretSet: boolean;
  history: GuessDto[];
  rematchVotes: {
    seat1: boolean;
    seat2: boolean;
  };
};

export type RoomStateDto = {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  players: RoomPlayerDto[];
  game: GameDto | null;
};
