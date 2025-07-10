// File: app/classes/ai.js
const axios = require('axios');
const { db } = require('../db');

class AI {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 30000, // 30 seconds
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getContext(key) {
    const [rows] = await db.query('SELECT content FROM ai_context WHERE key_name = ?', [key]);
    return rows[0]?.content || '';
  }

  async getContexts() {
    const [rows] = await db.query('SELECT key_name, content FROM ai_context');
    return rows;
  }

  async setContext(key, content) {
    await db.query(
      'INSERT INTO ai_context (key_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
      [key, content]
    );
  }

  async getCompletion(prompt, contextKey = null) {
    const context = contextKey ? await this.getContext(contextKey) : '';
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    const response = await this.client.post('/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a fantasy baseball expert providing strategic advice.' },
        { role: 'user', content: fullPrompt }
      ],
    });

    return response.data.choices[0].message.content.trim();
  }
}

module.exports = AI;