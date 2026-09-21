# Naughty List

A desktop companion for League of Legends. Your crew keeps a shared list of
players who did something naughty, with notes. When one of them shows up in
your game (either team), you get a notification and the app highlights them.

Windows and macOS.

## Install (friends)

1. Grab the latest `.dmg` (Mac) or `-setup.exe` (Windows) from
   [Releases](https://github.com/blakedoyle93/naughty-list/releases).
2. **Mac:** the build is unsigned. First launch: right-click the app → Open.
   **Windows:** SmartScreen will say "unknown publisher" once. More info → Run anyway.
3. Open the app → **Crew** tab → Sign in with Discord → paste the invite code
   you were given.
4. Leave it running in the tray. It finds the League client on its own.

That's it. The app is already pointed at the shared backend; the invite code
is the only thing you need from whoever runs the crew.

### Adding a lot of people at once

**The list** tab → "Got a whole list? Paste it here". One per line, League open:

```
GameName#TAG - what they did
```

`seed/naughty-list.txt` is the starter list.

## How detection works

| When                  | Who we can see                           | Why                                                       |
| --------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Champ select          | Teammates only, and only in normals/ARAM | Riot hides enemy identities and hides teammates in ranked |
| Loading screen onward | All 10 players                           | The game exposes them via the local Live Client Data API  |
| Post-game screen      | All 10 players                           | This is where you flag people                             |

Matching uses Riot's PUUID, so a name change doesn't get anyone off the list.

The app only talks to two local endpoints Riot exposes for third-party tools
(the League client API on `127.0.0.1` and the in-game Live Client Data API).
No memory reading, no game hooks. Riot's Vanguard FAQ states apps built on
these APIs are expected to keep working. Riot's LCU policy technically asks
developers to request approval before releasing an LCU app; this is a private
tool for a friend group and does not do that. LCU apps are prohibited in Korea.

## Development

```bash
cp .env.example .env          # fill in Supabase URL + anon key
npm install
npx supabase start            # local Postgres + auth (needs Docker)
npx supabase db reset         # apply migrations
npx supabase test db          # pgTAP RLS tests
npm test                      # vitest
npm run dev                   # electron with HMR
```

Supabase dashboard setup (once):

- Authentication → Providers → Discord: client id/secret from a Discord
  application whose redirect is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Authentication → URL Configuration → Redirect URLs: add
  `http://localhost:53682/callback`.

## Contributing

`main` is protected: nobody pushes to it directly, changes land through a PR
with one approval and green CI.

```bash
git clone git@github.com:blakedoyle93/naughty-list.git
cd naughty-list
cp .env.example .env          # ask Blake for the Supabase URL + anon key
npm install
git checkout -b feat/your-thing
npm run dev                   # hack
npm test && npm run lint && npm run typecheck
git push -u origin feat/your-thing
gh pr create                  # or open one on GitHub
```

Conventional commit messages (`feat:`, `fix:`, `chore:`). Prettier and ESLint
run in CI, so run them locally first.

## Release

```bash
npm version patch
git push && git push --tags
```

GitHub Actions builds Mac + Windows installers and publishes a Release. Installed
apps auto-update from there. Repo secrets required: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`.

## Docs

- Design spec: `docs/superpowers/specs/2026-09-22-naughty-list-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-22-naughty-list-mvp.md`
