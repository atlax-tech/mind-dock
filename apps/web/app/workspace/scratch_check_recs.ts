import { listRecommendations, listRecommendationDockQueue } from '../lib/repository'

async function check() {
  const userId = 'user_123' // Assume a default user id or get it from somewhere
  const recs = await listRecommendations(userId)
  console.log('Total recommendations:', recs.length)
  if (recs.length > 0) {
    console.log('First rec:', JSON.stringify(recs[0], null, 2))
  }
}

check()
