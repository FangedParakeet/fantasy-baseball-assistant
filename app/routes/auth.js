const express = require('express');
const Token = require('../classes/token');
const Yahoo = require('../classes/yahoo');
const { db } = require('../db');
const { sendSuccess, sendError } = require('../utils');

const router = express.Router();
const token = new Token();
const yahoo = new Yahoo();

// Get current token status
router.get('/token-status', async (req, res) => {
  try {
    const status = await token.status();
    sendSuccess(res, status, 'Token status retrieved successfully');
  } catch (error) {
    console.error('Token status error:', error);
    sendError(res, 500, 'Failed to get token status');
  }
});

// OAuth login redirect
router.get('/login', async (req, res) => {
  try {
    const authUrl = await yahoo.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, 500, 'Failed to generate auth URL');
  }
});

// OAuth redirect handler
router.get('/redirect', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return sendError(res, 400, 'Authorization code required');
    }

    console.log('=== OAUTH REDIRECT DEBUG ===');
    console.log('Authorization code received:', code);

    // Exchange code for tokens
    const tokensResponse = await yahoo.getTokens(code);
    console.log('OAuth tokens received:', tokensResponse);

    if (tokensResponse.error) {
      console.error('OAuth error:', tokensResponse);
      return sendError(res, 400, 'OAuth failed');
    }

    await token.set(tokensResponse);

    console.log('Tokens stored in database successfully');

    // Redirect to frontend with success
    res.redirect(`https://${process.env.SITE_DOMAIN}/?oauth=success`);
  } catch (error) {
    console.error('OAuth redirect error:', error);
    sendError(res, 500, 'OAuth authentication failed');
  }
});

// Refresh Yahoo token
router.post('/refresh-token', async (req, res) => {
  try {
    const oldTokens = await token.get();
    console.log('oldTokens', oldTokens);
    
    if (!oldTokens.refresh_token) {
      return sendError(res, 400, 'No refresh token available');
    }

    const newTokens = await yahoo.refreshTokens(oldTokens.refresh_token);
    
    if (newTokens.error) {
      return sendError(res, 400, 'Token refresh failed');
    }

    await token.set(newTokens);

    sendSuccess(res, { message: 'Token refreshed successfully' }, 'Token refreshed successfully');
  } catch (error) {
    console.error('Token refresh error:', error);
    sendError(res, 500, 'Token refresh failed');
  }
});

// Get access token (for API calls)
router.get('/access-token', async (req, res) => {
  try {
    const tokens = await token.get();
    
    if (!tokens.access_token) {
      return sendError(res, 404, 'No access token available');
    }

    const isExpired = !tokens.expires_at || new Date(tokens.expires_at) <= new Date();

    if (isExpired) {
      return sendError(res, 401, 'Token expired');
    }

    sendSuccess(res, { access_token: tokens.access_token }, 'Access token retrieved successfully');
  } catch (error) {
    console.error('Get access token error:', error);
    sendError(res, 500, 'Failed to get access token');
  }
});

module.exports = router;
