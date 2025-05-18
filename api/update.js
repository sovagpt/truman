
// api/update.js
import { Redis } from '@upstash/redis'
import OpenAI from 'openai';

const UPDATE_FREQUENCY = 0.3;
const npcNames = ['sarah', 'michael', 'emma', 'james', 'olivia', 'william', 'sophia'];

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: 'edge'
}

function selectNewTopic(sprite1, sprite2, isTrumanPresent) {
  const topics = isTrumanPresent ? [
    'local events', 'hobbies', 'weather', 'town life', 
    'daily activities', 'community news'
  ] : [
    'show logistics', 'token performance', 'simulation maintenance',
    'personal matters', 'production issues'
  ];

  const usedTopics = new Set(sprite1.recentTopics || []);
  const availableTopics = topics.filter(t => !usedTopics.has(t));
  const newTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)] || topics[0];
  
  if (!sprite1.recentTopics) sprite1.recentTopics = [];
  sprite1.recentTopics.push(newTopic);
  if (sprite1.recentTopics.length > 3) sprite1.recentTopics.shift();
  
  return newTopic;
}

function updateRelationships(sprite1, sprite2, content) {
  if (!sprite1.relationships) sprite1.relationships = {};
  if (!sprite1.relationships[sprite2.id]) {
    sprite1.relationships[sprite2.id] = 'neutral';
  }

  const moodKeywords = {
    positive: ['happy', 'great', 'wonderful', 'agree', 'yes'],
    negative: ['concerned', 'worried', 'disagree', 'no', 'problem']
  };

  const sentiment = Object.entries(moodKeywords).find(([mood, words]) =>
    words.some(word => content.toLowerCase().includes(word))
  )?.[0] || 'neutral';

  sprite1.currentMood = sentiment;
  sprite1.lastInteraction = sprite1.lastInteraction || {};
  sprite1.lastInteraction[sprite2.id] = Date.now();
}

function checkCollision(x, y) {
  const forbiddenAreas = [
    { x: 300, y: 0, width: 100, height: 960 }, // River
  ];

  for (const area of forbiddenAreas) {
    if (x >= area.x && x <= area.x + area.width &&
        y >= area.y && y <= area.y + area.height) {
      return true;
    }
  }
  return false;
}

function calculateMovement(sprite, targetSprite, gameState) {
  // Stuck detection
  if (!sprite.lastPosition) sprite.lastPosition = { x: sprite.x, y: sprite.y };
  if (!sprite.stuckTimer) sprite.stuckTimer = 0;
 
  const movement = Math.abs(sprite.x - sprite.lastPosition.x) + Math.abs(sprite.y - sprite.lastPosition.y);
  if (movement < 1.5) {
    sprite.stuckTimer++;
    if (sprite.stuckTimer > 5) { // 20 seconds
      const truman = gameState.sprites.find(s => s.id === 'truman');
      sprite.momentumX = 0;
      sprite.momentumY = 0;
      sprite.currentTarget = {
        x: truman.x,
        y: truman.y
      };
      sprite.stuckTimer = 0;
    }
  } else {
    sprite.stuckTimer = 0;
  }
  sprite.lastPosition = { x: sprite.x, y: sprite.y };
 
  const dx = targetSprite.x - sprite.x;
  const dy = targetSprite.y - sprite.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (!sprite.state) sprite.state = 'idle';
  if (!sprite.stateTimer) sprite.stateTimer = 0;
  if (!sprite.currentTarget) sprite.currentTarget = null;
  
  sprite.stateTimer--;
  
  if (sprite.stateTimer <= 0) {
    sprite.state = Math.random() < 0.6 ? 'moving' : 'idle';
    sprite.stateTimer = sprite.state === 'idle' ? 200 : 150;
    
    if (sprite.state === 'moving' && Math.random() < 0.3) {
      const randomX = Math.random() * 900 + 50;
      const randomY = Math.random() * 900 + 50;
      sprite.currentTarget = { x: randomX, y: randomY };
    }
 
    if (sprite.id === 'truman' && Math.random() < 0.4) {
      const npcs = gameState.sprites.filter(s => s.id !== 'truman');
      sprite.currentTarget = npcs[Math.floor(Math.random() * npcs.length)];
    }
  }
 
  if (sprite.state === 'idle') {
    return { momentumX: 0, momentumY: 0 };
  }
 
  if (sprite.currentTarget) {
    const targetDx = sprite.currentTarget.x - sprite.x;
    const targetDy = sprite.currentTarget.y - sprite.y;
    const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
    return {
      momentumX: (sprite.momentumX || 0) * 0.95 + (targetDx / targetDist) * 3,
      momentumY: (sprite.momentumY || 0) * 0.95 + (targetDy / targetDist) * 3
    };
  }
 
  const targetDistance = sprite.id === 'truman' ? 0 : 80;
  const strength = (distance - targetDistance) * 0.15;
  
  return {
    momentumX: (sprite.momentumX || 0) * 0.95 + (dx / distance) * strength,
    momentumY: (sprite.momentumY || 0) * 0.95 + (dy / distance) * strength
  };
 }

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  try {
    let gameState = await redis.get('gameState')
    
    if (!gameState) {
      gameState = {
          sprites: [
              {
                  id: 'truman',
                  x: 450,
                  y: 500,
                  type: 'TrumanSprite',
                  isUnaware: true,
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'sarah',
                  x: 450,
                  y: 450,
                  type: 'SarahSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'michael',
                  x: 550,
                  y: 550,
                  type: 'MichaelSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'emma',
                  x: 400,
                  y: 500,
                  type: 'EmmaSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'james',
                  x: 600,
                  y: 400,
                  type: 'JamesSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'olivia',
                  x: 500,
                  y: 600,
                  type: 'OliviaSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'william',
                  x: 250,
                  y: 550,
                  type: 'WilliamSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'sophia',
                  x: 650,
                  y: 650,
                  type: 'SophiaSprite',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              }
          ],
          time: Date.now(),
          thoughts: [],
          conversations: [],
          conversationHistory: [],
          currentTopic: null,
          topicDuration: 0,
          relationships: {},
          moodStates: {},
          currentEvent: null,
          votes: {
  "Deforest the eastern woods": 0,
  "Start a fire downtown": 0,
  "Give Bonky internet access": 0,
  "Remove an NPC permanently": 0
},
          voteStartTime: Date.now(),
          voteEndTime: Date.now() + (24 * 60 * 60 * 1000),
          activeVoting: true
      }
    }

    async function generateDialogue(sprite1, sprite2) {
      const isTrumanPresent = sprite1.id === 'truman' || sprite2.id === 'truman';
      const recentHistory = (gameState.conversationHistory || [])
        .filter(c => (c.speaker === sprite1.id && c.listener === sprite2.id) || 
                     (c.speaker === sprite2.id && c.listener === sprite1.id))
        .slice(-5);
    
        const npcRoles = {
          sarah: {
              role: "village elder",
              traits: ["philosophical", "wise", "observant"],
              interests: ["meditation", "town history", "mentoring others"],
              background: "Has seen the town grow from its earliest days, deeply connected to its rhythms"
          },
          michael: {
              role: "shopkeeper",
              traits: ["chatty", "analytical", "business-minded"],
              interests: ["market trends", "customer psychology", "town economics"],
              background: "Runs multiple businesses, has a finger on the town's pulse"
          },
          emma: {
              role: "neighbor",
              traits: ["empathetic", "perceptive", "nurturing"],
              interests: ["community building", "psychology", "social dynamics"],
              background: "Specializes in maintaining community harmony"
          },
          james: {
              role: "historian",
              traits: ["detail-oriented", "contemplative", "scholarly"],
              interests: ["patterns", "documentation", "town mysteries"],
              background: "Maintains detailed records of town events and anomalies"
          },
          olivia: {
              role: "scientist",
              traits: ["analytical", "curious", "systematic"],
              interests: ["data analysis", "behavioral studies", "system optimization"],
              background: "Studies town patterns and maintains technical systems"
          },
          william: {
              role: "gardener",
              traits: ["patient", "observant", "grounded"],
              interests: ["nature patterns", "town aesthetics", "environmental balance"],
              background: "Maintains the town's natural appearance and balance"
          },
          sophia: {
              role: "storyteller",
              traits: ["creative", "insightful", "expressive"],
              interests: ["narrative crafting", "people watching", "town lore"],
              background: "Weaves stories that reinforce the town's narrative"
          }
      };

      const conversationTypes = {
        casual: [
            "daily observations", "local happenings", "weather patterns",
            "town changes", "community events", "personal stories",
            "local mysteries", "town traditions", "recent developments"
        ],
        meta: [
            "simulation stability", "narrative coherence", "behavioral patterns",
            "system maintenance", "engagement metrics", "token dynamics",
            "script deviations", "reality maintenance", "containment strategies"
        ]
    };
    
    const conversationContexts = {
        morning: ["coffee runs", "daily planning", "opening routines"],
        afternoon: ["lunch breaks", "daily progress", "community activities"],
        evening: ["day reflection", "closing thoughts", "tomorrow's plans"],
        special: ["events", "anomalies", "concerns", "celebrations"]
    };
    
    const timeOfDay = new Date().getHours();
    const timeContext = 
        timeOfDay < 12 ? 'morning' :
        timeOfDay < 18 ? 'afternoon' : 'evening';
    
      const currentTopic = sprite1.recentTopics?.[sprite1.recentTopics.length - 1] || 
                          selectNewTopic(sprite1, sprite2, isTrumanPresent);
      const mood = sprite1.currentMood || 'neutral';
      const relationship = (sprite1.relationships || {})[sprite2.id] || 'neutral';
      const context = recentHistory.length > 0 
        ? `Recent conversation:\n${recentHistory.map(h => `${h.speaker}: ${h.content}`).join('\n')}` 
        : '';
    
      let prompt;
      if (isTrumanPresent) {
        const casualTopic = conversationTypes.casual[Math.floor(Math.random() * conversationTypes.casual.length)];
        const timeSpecificContext = conversationContexts[timeContext][Math.floor(Math.random() * conversationContexts[timeContext].length)];
        
        prompt = `You are ${sprite1.id}, a ${npcRoles[sprite1.id].traits.join(", ")} ${npcRoles[sprite1.id].role}.
            Your interests: ${npcRoles[sprite1.id].interests.join(", ")}.
            Background: ${npcRoles[sprite1.id].background}
            
            You're talking to ${sprite2.id} during ${timeContext} (${timeSpecificContext}).
            Current topic: ${casualTopic}
            Your mood: ${mood}
            Your relationship: ${relationship}
            
            ${context ? `Recent context:\n${context}` : ''}
            
            Have a natural conversation that reflects your personality and the time of day.
            Draw from your unique traits and interests while keeping the town's illusion intact.
            Keep responses conversational and brief.`;
    } else {
        const metaTopic = conversationTypes.meta[Math.floor(Math.random() * conversationTypes.meta.length)];
        const timeSpecificContext = conversationContexts[timeContext][Math.floor(Math.random() * conversationContexts[timeContext].length)];
        
        prompt = `You are ${sprite1.id}, a ${npcRoles[sprite1.id].traits.join(", ")} ${npcRoles[sprite1.id].role}.
            Your interests: ${npcRoles[sprite1.id].interests.join(", ")}.
            Background: ${npcRoles[sprite1.id].background}
            
            You're having a private conversation with ${sprite2.id} during ${timeContext} (${timeSpecificContext}).
            Behind-the-scenes topic: ${metaTopic}
            Your mood: ${mood}
            Your relationship: ${relationship}
            
            ${context ? `Recent context:\n${context}` : ''}
            
            Blend your character's personality with show awareness.
            Be natural - reflect both your role and meta-knowledge about Bonky's situation.
            Keep responses conversational and specific to your character.`;
    }
    
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 75,
          temperature: 0.9,
          presence_penalty: 0.6,
          frequency_penalty: 0.8
      });
    
        const content = completion.choices[0].message.content
          .split('\n')[0]
          .replace(/^[^:]*:\s*/, '')
          .replace(/\s+[^:]*:.*$/, '')
          .replace(/^["']|["']$/g, '')
          .trim();
    
        updateRelationships(sprite1, sprite2, content);
    
        const dialogue = {
          speaker: sprite1.id,
          listener: sprite2.id,
          content,
          topic: currentTopic,
          mood: sprite1.currentMood,
          timestamp: Date.now()
        };
    
        if (!gameState.conversationHistory) gameState.conversationHistory = [];
        gameState.conversationHistory.push(dialogue);
        if (gameState.conversationHistory.length > 50) {
          gameState.conversationHistory = gameState.conversationHistory.slice(-50);
        }
    
        return dialogue;
      } catch (error) {
        console.error('Dialogue generation error:', error);
        return null;
      }
    }
  
  if (!gameState.sprites) {
      gameState.sprites = [];
  }

  gameState.sprites = await Promise.all(gameState.sprites.map(async sprite => {
    if (sprite.id === 'truman') {
      const targetSprite = sprite.currentTarget || {
        x: sprite.x + (Math.random() - 0.5) * 100,
        y: sprite.y + (Math.random() - 0.5) * 100
      };
      
      const { momentumX, momentumY } = calculateMovement(sprite, targetSprite, gameState);
      sprite.momentumX = momentumX;
      sprite.momentumY = momentumY;
      console.log(`${sprite.id} position:`, sprite.x, sprite.y, 'state:', sprite.state);

      // Add Truman thought generation
      if (Math.random() < 0.02) { 
        try {
            // Get recent conversation if any
            const recentConvo = gameState.conversations && gameState.conversations.length > 0 ? 
                gameState.conversations[gameState.conversations.length - 1] : null;
            
            // Get random pattern type for varied observations
            const patternTypes = [
                'daily routines',
                'weather patterns',
                'people behaviors',
                'town oddities',
                'background sounds',
                'recent conversations'
            ];
            const randomPattern = patternTypes[Math.floor(Math.random() * patternTypes.length)];
            
            let prompt;
            if (recentConvo && recentConvo.listener === 'truman') {
                prompt = `You are Bonky. ${recentConvo.speaker} just said to you: "${recentConvo.content}"
    Generate a suspicious thought about this interaction (max 20 words).
    Focus on inconsistencies in their story or weird behavior.
    Examples: 
    - "That's the third time they've mentioned childhood memories I don't remember..."
    - "Why do they keep steering conversations away from the edge of town?"
    Don't mention Seahaven, this is Full Port Town.`;
            } else {
                prompt = `You are Bonky living in Full Port Town. Generate a brief suspicious thought about ${randomPattern} (max 20 words).
    Express confusion about strange occurrences you notice.
    Examples based on pattern type:
    - Daily routines: "Everyone arrives at the coffee shop at exactly 8:15, like clockwork..."
    - Weather: "The rain always stops precisely when I need to go somewhere."
    - People: "Why do the same strangers keep appearing in different jobs?"
    - Town: "That building appeared overnight, but everyone acts like it's always been there."
    - Sounds: "The birds... they sound like they're on a loop."
    - Conversations: "Why does everyone change the subject when I mention traveling?"
    Make it subtle and specific to Full Port Town.`;
            }
    
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 50,
                temperature: 0.7,
            });
            
            const thought = completion.choices[0].message.content;
            if (!gameState.thoughts) gameState.thoughts = [];
            
            // Check if this thought isn't already the last thought
            const lastThought = gameState.thoughts[gameState.thoughts.length - 1];
            if (!lastThought || lastThought.thought !== thought) {
                gameState.thoughts.push({
                    spriteId: 'truman',
                    thought: thought,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error generating thought:', error);
        }
    }
    } else {
      const truman = gameState.sprites.find(s => s.id === 'truman');
      const otherNPCs = gameState.sprites.filter(s => s.id !== sprite.id && s.id !== 'truman');
      const targetSprite = Math.random() < 0.3 ? truman : otherNPCs[Math.floor(Math.random() * otherNPCs.length)];
      
      const { momentumX, momentumY } = calculateMovement(sprite, targetSprite, gameState);
      sprite.momentumX = momentumX;
      sprite.momentumY = momentumY;

      const distance = Math.sqrt(
        Math.pow(targetSprite.x - sprite.x, 2) + 
        Math.pow(targetSprite.y - sprite.y, 2)
      );
      
      if (distance < 80 && sprite.state === 'idle' && Math.random() < 0.3) {
        console.log(`${sprite.id} checking conversation with ${targetSprite.id}, distance:`, distance);
        const dialogue = await generateDialogue(sprite, targetSprite);
        if (dialogue) {
          console.log("Generated dialogue:", dialogue);
          if (!gameState.conversations) gameState.conversations = [];
          if (!sprite.conversations) sprite.conversations = [];
          if (!targetSprite.conversations) targetSprite.conversations = [];
          
          gameState.conversations.push(dialogue);
          sprite.conversations.push(dialogue);
          targetSprite.conversations.push(dialogue);
          
          if (gameState.conversations.length > 50) {
            gameState.conversations = gameState.conversations.slice(-50);
          }
          if (sprite.conversations.length > 10) {
            sprite.conversations = sprite.conversations.slice(-10);
          }
          if (targetSprite.conversations.length > 10) {
            targetSprite.conversations = targetSprite.conversations.slice(-10);
          }
          
          const response = await generateDialogue(targetSprite, sprite);
          if (response) {
            gameState.conversations.push(response);
            sprite.conversations.push(response);
            targetSprite.conversations.push(response);
          }
        }
      }
    }

      let newX = Math.max(50, Math.min(910, sprite.x + sprite.momentumX));
      let newY = Math.max(50, Math.min(910, sprite.y + sprite.momentumY));
      
      if (checkCollision(newX, newY)) {
        newX = sprite.x;
        newY = sprite.y;
        sprite.momentumX = -sprite.momentumX;
        sprite.momentumY = -sprite.momentumY;
      }

      return {
        ...sprite,
        x: newX,
        y: newY,
        momentumX: sprite.momentumX,
        momentumY: sprite.momentumY,
        state: sprite.state,
        stateTimer: sprite.stateTimer,
        currentTarget: sprite.currentTarget,
        thoughts: sprite.thoughts,
        conversations: sprite.conversations
      };
    }));

    gameState.time = Date.now();
    await redis.set('gameState', gameState);

    return new Response(JSON.stringify(gameState), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('Update error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
