import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { answerQuestion } from './assistant.service'
import { SUGGESTED_QUESTIONS } from './assistant.intents'

export const assistantPlugin = new Elysia({ name: 'assistant' })
  .use(authGuard)
  .group('/api/assistant', (app) =>
    app
      .get('/suggestions', () => ({ suggestions: SUGGESTED_QUESTIONS }), {
        detail: { tags: ['assistant'], summary: 'Suggested questions for the assistant UI' },
      })
      .post('/query', async ({ body }) => answerQuestion(body.question), {
        body: t.Object({
          question: t.String({ minLength: 3, maxLength: 500 }),
        }),
        detail: { tags: ['assistant'], summary: 'Natural-language operational query' },
      })
  )
