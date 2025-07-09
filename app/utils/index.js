const Token = require('../classes/token');
const Yahoo = require('../classes/yahoo');

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

const parseEligiblePositions = (eligiblePositions) => {
  const positions = JSON.parse(eligible_positions);
  if (Array.isArray(positions)) {
    // If array of objects with 'position' key
    if (positions.length > 0 && typeof positions[0] === 'object' && positions[0] !== null && 'position' in positions[0]) {
      return positions.map(pos => pos.position).join(', ');
    }
    // If array of strings
    return positions.join(', ');
  }
  return positions;
}

  
  module.exports = {
    getValidAccessToken,
    parseEligiblePositions
  };