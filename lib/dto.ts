import type { GameStatus, RoomStatus } from "@/lib/constants";

export type RoomPlayerDto = {
  seat: 1 | 2;
  name: string;
  online: boolean;
};

export type ChatMessageDto = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
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
  turnDeadlineAt: string | null;
  winnerSeat: 1 | 2 | null;
  mySeat: 1 | 2 | null;
  mySecretSet: boolean;
  mySecret: string | null;
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
  viewerRole: "player" | "spectator";
  settings: {
    turnSeconds: number;
    isHost: boolean;
  };
  spectatorPath: string | null;
  players: RoomPlayerDto[];
  chat: ChatMessageDto[];
  stats: {
    seat1Wins: number;
    seat2Wins: number;
    finishedRounds: number;
    avgTurns: number;
  };
  game: GameDto | null;
};
