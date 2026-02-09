# Быки и коровы онлайн

Онлайн-игра 1v1 на `Next.js + Supabase`, где два игрока подключаются к одной комнате по коду.

## Что реализовано

- Комнаты 1v1 с кодом подключения.
- Анонимная авторизация через Supabase.
- Realtime обновления через `room_events` + fallback polling.
- Реванш в той же комнате.
- UX-улучшения:
  - toast-уведомления;
  - режимы хода с таймером (0/30/45/60);
  - чат комнаты;
  - режим наблюдателя (read-only spectator link);
  - разделенные панели ходов;
  - мини-статистика по раундам;
  - переключатели темы/скина/контраста;
  - мягкие анимации появления блоков и новых ходов.
- E2E-скелет на Playwright.

## Стек

- Next.js (App Router, TypeScript)
- Supabase (Postgres, Auth, Realtime)
- Vitest + Playwright

## Переменные окружения

Создайте `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Установка и запуск

```bash
npm install
npm run dev
```

Локально: `http://localhost:3000`.

## Миграции Supabase

Нужно применить обе миграции в SQL Editor:

1. `supabase/migrations/202602091430_init.sql`
2. `supabase/migrations/202602091930_ux_social_upgrade.sql`

## Скрипты

```bash
npm run test
npm run build
npm run test:e2e
```

Для e2e-мультиплеера:

```bash
E2E_RUN_ONLINE=1 npm run test:e2e
```

## Основные API

- `POST /api/rooms/create`
- `POST /api/rooms/join`
- `GET /api/rooms/:code/state`
- `POST /api/rooms/:code/heartbeat`
- `POST /api/rooms/:code/chat`
- `POST /api/rooms/:code/settings`
- `POST /api/games/:gameId/secret`
- `POST /api/games/:gameId/guess`
- `POST /api/games/:gameId/rematch-vote`
- `GET /api/watch/:code/state?key=...`
- `GET /api/health`

## QA чеклист

Сценарии интеграции/e2e и security: `docs/qa-checklist.md`.
