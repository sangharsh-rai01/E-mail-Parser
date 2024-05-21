import express from 'express';
import { google } from 'googleapis';
import { PublicClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import OpenAI from 'openai';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import readline from 'readline';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const TOKEN_PATH = 'token.json';

const googleCredentials = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uris: [process.env.GOOGLE_REDIRECT_URI],
};

const outlookCredentials = {
  clientId: process.env.OUTLOOK_CLIENT_ID,
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
  tenantId: process.env.OUTLOOK_TENANT_ID,
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Initialize OAuth2 client for Google
const oAuth2Client = new google.auth.OAuth2(
    googleCredentials.client_id,
    googleCredentials.client_secret,
    googleCredentials.redirect_uris[0]
  );
  
  // Function to get Google access token
  function getGoogleAccessToken(oAuth2Client, res) {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('Authorize this app by visiting this URL:', authUrl);
    res.redirect(authUrl);
  }
  
  // OAuth2 Client Initialization for Google
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) {
      console.log('Token not found, requiring authentication');
    } else {
      oAuth2Client.setCredentials(JSON.parse(token));
      console.log('OAuth2 client initialized');
    }
  });
  
  // Function to authorize Google
  function authorizeGoogle(callback) {
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      console.log('OAuth2 client not initialized');
      return callback(new Error('OAuth2 client not initialized'));
    }
    callback(null, oAuth2Client);
  }
  
  // Function to handle Google OAuth2 callback
  app.get('/auth/google/callback', (req, res) => {
    const code = req.query.code;
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('Error retrieving access token', err);
        return res.status(400).send('Authentication failed');
      }
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log('Token stored to', TOKEN_PATH);
      res.send('Authentication successful! You can close this window.');
    });
  });

  // Express Routes
app.get('/auth/google', (req, res) => {
    getGoogleAccessToken(oAuth2Client, res);
  });
  
  app.get('/auth/google/parser', (req, res) => {
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      console.log('Token not found, requiring authentication');
      return getGoogleAccessToken(oAuth2Client, res);
    }
    // Proceed with parsing after successful authentication
    authorizeGoogle((err, authClient) => {
      if (err) {
        console.error('Authorization failed', err);
        return res.status(500).send('Authorization failed');
      }
      // Here you can proceed with the logic that requires authorized Google API client
      res.send('Google OAuth2 client is ready');
    });
  });
  
  // Fetch emails from Gmail
  async function listMessages(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread', // Fetch only unread emails
    });
    const messages = res.data.messages || [];
    return messages;
  }
  
  async function getMessage(auth, messageId) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    });
    return res.data;
  }
  
  app.get('/fetch-emails', async (req, res) => {
    try {
      const messages = await listMessages(oAuth2Client);
      const emailPromises = messages.map(msg => getMessage(oAuth2Client, msg.id));
      const emails = await Promise.all(emailPromises);
      res.json(emails);
    } catch (error) {
      console.error('Error fetching emails:', error);
      res.status(500).send('Error fetching emails');
    }
  });

  // Analyze email content using OpenAI
async function categorizeEmail(content) {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Classify the email content into one of the following categories: Interested, Not Interested, More Information.',
        },
        {
          role: 'user',
          content: content,
        },
      ],
    });
    const category = response.choices[0].message.content.trim();
    return category;
  }
  
  // Send automated replies based on the category
  async function sendReply(auth, email, category) {
    const gmail = google.gmail({ version: 'v1', auth });
    let replyText;
  
    switch (category) {
      case 'Interested':
        replyText = 'Thank you for your interest! Would you be available for a demo call? Please let us know a suitable time.';
        break;
      case 'Not Interested':
        replyText = 'Thank you for your response. If you change your mind, feel free to contact us again.';
        break;
      case 'More Information':
        replyText = 'Thank you for your inquiry. Can you please provide more details about the information you need?';
        break;
      default:
        replyText = 'Thank you for your email.';
    }
  
    const raw = createRawEmail(email, replyText);
  
    await gmail.users.messages.send({
      userId: 'me',
      resource: {
        raw: raw,
      },
    });
  }

  function createRawEmail(email, replyText) {
    const from = email.payload.headers.find(header => header.name === 'From').value;
    const subject = email.payload.headers.find(header => header.name === 'Subject').value;
    const messageId = email.id;
  
    const raw = [
      `To: ${from}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      '',
      replyText,
    ].join('\n');
  
    return Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  
  // Set up task queue with BullMQ
  const emailQueue = new Queue('emailQueue', { connection });
  
  new Worker('emailQueue', async job => {
    const { email, category } = job.data;
    await sendReply(oAuth2Client, email, category);
  }, { connection });
  
  // Route to trigger email processing
  app.get('/process-emails', async (req, res) => {
    try {
      const messages = await listMessages(oAuth2Client);
      const emailPromises = messages.map(async msg => {
        const email = await getMessage(oAuth2Client, msg.id);
        const content = email.snippet;
        const category = await categorizeEmail(content);
        await emailQueue.add('sendEmail', { email, category });
      });
      await Promise.all(emailPromises);
      res.send('Emails processed successfully');
    } catch (error) {
      console.error('Error processing emails:', error);
      res.status(500).send('Error processing emails');
    }
  });  

  // Initialize MSAL Public Client Application
const msalConfig = {
    auth: {
      clientId: outlookCredentials.clientId,
      authority: `https://login.microsoftonline.com/${outlookCredentials.tenantId}`,
      clientSecret: outlookCredentials.clientSecret,
    },
  };
  
  const cca = new PublicClientApplication(msalConfig);
  
  async function getOutlookAuthenticatedClient() {
    const authResult = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({
      authProvider: done => done(null, authResult.accessToken),
    });
    return client;
  }
  
  // Fetch emails from Outlook
  app.get('/fetch-emails/outlook', async (req, res) => {
    try {
      const client = await getOutlookAuthenticatedClient();
      const messages = await client.api('/me/messages').filter('isRead eq false').get();
      res.json(messages.value);
    } catch (error) {
      console.error('Error fetching Outlook emails:', error);
      res.status(500).send('Error fetching Outlook emails');
    }
  });
  
  // Start the server
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
  