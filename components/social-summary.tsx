"use client";

import type { FriendEntry, MatchEntry } from "@/lib/local-social";

type Props = {
  friends: FriendEntry[];
  matches: MatchEntry[];
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  } catch {
    return iso;
  }
}

export function SocialSummary({ friends, matches }: Props) {
  return (
    <section className="card" style={{ marginTop: 14 }}>
      <h2 className="section-title">Друзья и история</h2>
      <div className="split-turns">
        <div className="mini-card">
          <strong>Последние друзья</strong>
          <ul className="history">
            {friends.slice(0, 8).map((friend) => (
              <li key={`${friend.name}-${friend.lastPlayedAt}`}>
                {friend.name} <span className="hint">({formatDate(friend.lastPlayedAt)})</span>
              </li>
            ))}
            {!friends.length ? <li className="hint">Пока пусто.</li> : null}
          </ul>
        </div>
        <div className="mini-card">
          <strong>Последние матчи</strong>
          <ul className="history">
            {matches.slice(0, 8).map((match) => (
              <li key={match.gameId}>
                {match.result === "win" ? "Победа" : "Поражение"} vs {match.opponentName}{" "}
                <span className="hint">({formatDate(match.finishedAt)})</span>
              </li>
            ))}
            {!matches.length ? <li className="hint">Пока пусто.</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
