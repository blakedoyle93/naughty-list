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
