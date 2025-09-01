// api/stream.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  runtime: 'edge'
}

export default async function handler(request) {
  try {
    let gameState = await redis.get('gameState')
    if (!gameState) {
      gameState = {
        sprites: [
          {
            id: 'frankdegods',
            x: 500,
            y: 500,
            type: 'FrankDeGodsSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'frankdegods',
            thoughts: [],
            memories: []
          },
          {
            id: 'cupsey',
            x: 450,
            y: 450,
            type: 'CupseySprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'cupsey',
            thoughts: [],
            memories: []
          },
          {
            id: 'jalen',
            x: 550,
            y: 550,
            type: 'JalenSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'jalen',
            thoughts: [],
            memories: []
          },
          {
            id: 'orangie',
            x: 400,
            y: 500,
            type: 'OrangieSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'orangie',
            thoughts: [],
            memories: []
          },
          {
            id: 'baoskee',
            x: 600,
            y: 400,
            type: 'AlonSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'baoskee',
            thoughts: [],
            memories: []
          },
          {
            id: 'zachxbt',
            x: 500,
            y: 600,
            type: 'ZachXBTSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'zachxbt',
            thoughts: [],
            memories: []
          },
          {
            id: 'west',
            x: 350,
            y: 350,
            type: 'WestSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'west',
            thoughts: [],
            memories: []
          },
          {
            id: 'assassin',
            x: 650,
            y: 650,
            type: 'AssassinSprite',
            isUnaware: true,
            suspicionLevel: 0,
            personalityType: 'assassin',
            thoughts: [],
            memories: []
          }
        ],
        time: Date.now(),
        thoughts: [],
        currentEvent: null,
        votes: {
          "frankdegods": 0,
          "cupsey": 0,
          "jalen": 0,
          "orangie": 0,
          "baoskee": 0,
          "zachxbt": 0,
          "west": 0,
          "assassin": 0
        },
        voteStartTime: Date.now(),
        voteEndTime: Date.now() + (24 * 60 * 60 * 1000),
        activeVoting: true
      };
      await redis.set('gameState', gameState)
    }

    console.log('Current game state:', {
      spriteCount: gameState.sprites?.length,
      spritePositions: gameState.sprites?.map(s => ({id: s.id, x: s.x, y: s.y}))
    });

    const message = `data: ${JSON.stringify(gameState)}\n\n`;
    return new Response(message, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('Stream error:', error);
    return new Response(`data: ${JSON.stringify({ error: error.message })}\n\n`, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

