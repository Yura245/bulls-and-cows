# Быки и коровы онлайн (MVP)

Онлайн-игра 1v1 на `Next.js + Supabase`, где два игрока подключаются по коду комнаты и играют в реальном времени.

## Что реализовано

- Создание комнаты и вход по 6-символьному коду.
- Анонимная авторизация через Supabase (`signInAnonymously`).
- Режим 1v1, 4 цифры без повторов.
- Серверные API для:
  - создания/входа в комнату;
  - получения state комнаты;
  - heartbeat онлайн-статуса;
  - задания секрета;
  - хода;
  - реванша.
- Realtime через `room_events` + fallback polling раз в 3 секунды.
- SQL-миграция со схемой, индексами, RLS-политиками и подключением таблицы событий к Realtime.
- Unit-тесты для игровой логики и валидаторов.

## Стек

- Next.js (App Router, TypeScript)
- Supabase (Postgres, Auth, Realtime)
- Vitest

## Подготовка окружения

1. Скопируйте `.env.example` в `.env.local`.
2. Заполните переменные:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Установка и запуск

```bash
npm install
npm run dev
```

Приложение будет доступно на `http://localhost:3000`.

## Миграции Supabase

SQL-файл:

- `supabase/migrations/202602091430_init.sql`

Применить можно через Supabase SQL Editor или Supabase CLI.

## Проверка

```bash
npm run test
```

Сценарии интеграционной и e2e-проверки описаны в `docs/qa-checklist.md`.

## Основные API

- `POST /api/rooms/create`
- `POST /api/rooms/join`
- `GET /api/rooms/:code/state`
- `POST /api/rooms/:code/heartbeat`
- `POST /api/games/:gameId/secret`
- `POST /api/games/:gameId/guess`
- `POST /api/games/:gameId/rematch-vote`
- `GET /api/health`

## Заметки по безопасности

- Расчет быков/коров выполняется только на сервере.
- Таблица `game_secrets` недоступна клиенту через RLS.
- Критичные игровые действия идут через API.
