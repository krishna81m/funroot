const { z } = require('zod')

const AnswerPayload = z.union([
  z.object({ selected: z.array(z.number()) }),                 // quiz, truefalse, poll
  z.object({ text: z.string().max(2000) }),                    // typeAnswer, openended
  z.object({ value: z.number() }),                             // slider
  z.object({ order: z.array(z.number()) }),                    // puzzle
  z.object({ word: z.string().max(100) }),                     // wordcloud
  z.object({ ideas: z.array(z.string().max(200)).max(3) }),    // brainstorm collect
  z.object({ votes: z.array(z.string()) }),                    // brainstorm vote
])

const schemas = {
  'client:join': z.object({
    pin: z.string().length(6),
    role: z.enum(['HOST', 'PLAYER']),
    identifier: z.string().max(200).optional(),
    nickname: z.string().min(1).max(50).optional(),
  }),
  'client:submit_answer': z.object({
    pin: z.string().length(6),
    questionId: z.string(),
    answer: AnswerPayload,
  }),
  'host:start':     z.object({ pin: z.string().length(6) }),
  'host:next_item': z.object({ pin: z.string().length(6) }),
  'host:skip':      z.object({ pin: z.string().length(6) }),
  'host:pause':     z.object({ pin: z.string().length(6) }),
  'host:resume':    z.object({ pin: z.string().length(6) }),
  'host:reveal':    z.object({ pin: z.string().length(6) }),
  'host:kick':      z.object({ pin: z.string().length(6), socketId: z.string() }),
  'host:end':       z.object({ pin: z.string().length(6) }),
  'host:brainstorm_vote': z.object({ pin: z.string().length(6) }),
}

function validate(event, payload) {
  const schema = schemas[event]
  if (!schema) return { success: false, error: `Unknown event: ${event}` }
  const result = schema.safeParse(payload)
  if (!result.success) return { success: false, error: result.error.message }
  return { success: true, data: result.data }
}

module.exports = { validate }
