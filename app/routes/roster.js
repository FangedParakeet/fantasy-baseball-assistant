const express = require('express');
const router = express.Router();
const Team = require('../classes/team');
const Yahoo = require('../classes/yahoo');
const Token = require('../classes/token');


async function getValidAccessToken() {
  const token = new Token();
  const yahoo = new Yahoo();
  
  // Check token status
  const status = await token.status();
  
  if (!status.hasToken) {
    throw new Error('No token found. Please authenticate with Yahoo first.');
  }
  
  if (!status.hasValidToken) {
    // Token is expired, refresh it
    console.log('Token expired, refreshing...');
    const currentTokens = await token.get();
    
    if (!currentTokens.refresh_token) {
      throw new Error('No refresh token available. Please re-authenticate with Yahoo.');
    }
    
    try {
      const newTokens = await yahoo.refreshTokens(currentTokens.refresh_token);
      await token.set(newTokens);
      return newTokens.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error('Failed to refresh token. Please re-authenticate with Yahoo.');
    }
  }
  
  // Token is valid, return current access token
  const currentTokens = await token.get();
  return currentTokens.access_token;
}

router.get('/sync-roster', async (req, res) => {
  console.log('=== SYNC ROSTER DEBUG ===');
  
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo();
    const team = new Team(yahoo, accessToken);
    
    const result = await team.syncMyRoster();
    res.json(result);
  } catch (error) {
    console.error('Error syncing roster:', error);
    res.status(401).json({ error: error.message });
  }
});

router.get('/my-roster', async (req, res) => {
    console.log('=== MY ROSTER DEBUG ===');
    console.log('Route hit: /my-roster');
    
    try {
      const team = new Team();
      const result = await team.getMyRoster();
      console.log('Roster result:', result);
      res.json(result);
    } catch (error) {
      console.error('Error in /my-roster:', error);
      res.status(500).json({ error: 'Failed to get roster', details: error.message });
    }
  });
  

module.exports = router;
