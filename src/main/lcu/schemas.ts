import { z } from 'zod'

export const GameflowSessionSchema = z
  .object({
    phase: z.string(),
    gameData: z.object({ gameId: z.number() }).passthrough()
  })
  .passthrough()

export const ChampSelectCellSchema = z
  .object({
    cellId: z.number(),
    summonerId: z.number().default(0),
    puuid: z.string().default(''),
    championId: z.number().default(0),
    nameVisibilityType: z.string().optional()
  })
  .passthrough()

export const ChampSelectSessionSchema = z
  .object({
    gameId: z.number().optional(),
    localPlayerCellId: z.number(),
    myTeam: z.array(ChampSelectCellSchema),
    theirTeam: z.array(ChampSelectCellSchema).default([])
  })
  .passthrough()

export const SummonerSchema = z
  .object({
    puuid: z.string(),
    gameName: z.string().default(''),
    tagLine: z.string().default('')
  })
  .passthrough()

/** `/lol-summoner/v1/alias/lookup` answers `{ puuid, alias: { game_name, tag_line } }`. */
export const AliasLookupSchema = z
  .object({
    puuid: z.string(),
    alias: z.object({ game_name: z.string().default(''), tag_line: z.string().default('') })
  })
  .passthrough()
  .transform((a) => ({ puuid: a.puuid, gameName: a.alias.game_name, tagLine: a.alias.tag_line }))

/** Either summoner shape, or an array of them. Alias shape first: SummonerSchema would also
 *  accept it (puuid present, names defaulting to '') and lose the name. */
const OneSummoner = z.union([AliasLookupSchema, SummonerSchema])
export const SummonerLikeSchema = z
  .union([OneSummoner, z.array(OneSummoner)])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? null) : v))

const MatchParticipantIdentitySchema = z
  .object({
    participantId: z.number().default(0),
    player: z
      .object({
        puuid: z.string().default(''),
        gameName: z.string().default(''),
        tagLine: z.string().default(''),
        summonerName: z.string().default('')
      })
      .passthrough()
  })
  .passthrough()

const MatchParticipantSchema = z
  .object({
    participantId: z.number().default(0),
    teamId: z.number().default(0),
    championId: z.number().default(0),
    stats: z
      .object({ win: z.boolean().default(false) })
      .passthrough()
      .optional()
  })
  .passthrough()

export const MatchSchema = z
  .object({
    gameId: z.number(),
    gameCreation: z.number().default(0),
    gameCreationDate: z.string().default(''),
    queueId: z.number().default(0),
    participantIdentities: z.array(MatchParticipantIdentitySchema).default([]),
    participants: z.array(MatchParticipantSchema).default([])
  })
  .passthrough()

/** `/lol-match-history/v1/products/lol/current-summoner/matches` → `{ games: { games: [...] } }` */
export const MatchHistorySchema = z
  .object({ games: z.object({ games: z.array(MatchSchema).default([]) }).passthrough() })
  .passthrough()

export const EogPlayerSchema = z
  .object({
    puuid: z.string(),
    summonerName: z.string().default(''),
    riotIdGameName: z.string().optional(),
    riotIdTagLine: z.string().optional(),
    gameName: z.string().optional(),
    tagLine: z.string().optional(),
    championId: z.number().optional()
  })
  .passthrough()

export const EogStatsBlockSchema = z
  .object({
    gameId: z.number(),
    teams: z.array(
      z.object({ isPlayerTeam: z.boolean(), players: z.array(EogPlayerSchema) }).passthrough()
    )
  })
  .passthrough()
