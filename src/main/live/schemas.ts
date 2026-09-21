import { z } from 'zod'

export const LivePlayerSchema = z
  .object({
    championName: z.string().default(''),
    riotIdGameName: z.string().default(''),
    riotIdTagLine: z.string().default(''),
    riotId: z.string().optional(),
    summonerName: z.string().default(''),
    team: z.enum(['ORDER', 'CHAOS'])
  })
  .passthrough()

export const LivePlayerListSchema = z.array(LivePlayerSchema)
