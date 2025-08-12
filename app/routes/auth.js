const express = require('express');
const Token = require('../classes/token');
const Yahoo = require('../classes/yahoo');
const { db } = require('../db');

const router = express.Router();
const token = new Token();
const yahoo = new Yahoo();

// Get current token status
router.get('/token-status', async (req, res) => {
  try {
    const status = await token.status();

    res.json(status);
  } catch (error) {
    console.error('Token status error:', error);
    res.status(500).json({ error: 'Failed to get token status' });
  }
});

// OAuth login redirect
router.get('/login', async (req, res) => {
  try {
    const authUrl = await yahoo.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// OAuth redirect handler
router.get('/redirect', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    console.log('=== OAUTH REDIRECT DEBUG ===');
    console.log('Authorization code received:', code);

    // Exchange code for tokens
    const tokensResponse = await yahoo.getTokens(code);
    console.log('OAuth tokens received:', tokensResponse);

    if (tokensResponse.error) {
      console.error('OAuth error:', tokensResponse);
      return res.status(400).json({ error: 'OAuth failed', details: tokensResponse });
    }

    await token.set(tokensResponse);

    console.log('Tokens stored in database successfully');

    // Redirect to frontend with success
    res.redirect(`https://${process.env.SITE_DOMAIN}/?oauth=success`);
  } catch (error) {
    console.error('OAuth redirect error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// Refresh Yahoo token
router.post('/refresh-token', async (req, res) => {
  try {
    const oldTokens = await token.get();
    console.log('oldTokens', oldTokens);
    
    if (!oldTokens.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const newTokens = await yahoo.refreshTokens(oldTokens.refresh_token);
    
    if (newTokens.error) {
      return res.status(400).json({ error: 'Token refresh failed', details: newTokens });
    }

    await token.set(newTokens);

    res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Get access token (for API calls)
router.get('/access-token', async (req, res) => {
  try {
    const tokens = await token.get();
    
    if (!tokens.access_token) {
      return res.status(404).json({ error: 'No access token available' });
    }

    const isExpired = !tokens.expires_at || new Date(tokens.expires_at) <= new Date();

    if (isExpired) {
      return res.status(401).json({ error: 'Token expired' });
    }

    res.json({ access_token: tokens.access_token });
  } catch (error) {
    console.error('Get access token error:', error);
    res.status(500).json({ error: 'Failed to get access token' });
  }
});

module.exports = router;
