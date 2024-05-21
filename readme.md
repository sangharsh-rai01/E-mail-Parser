# Getting started

This project provides a tool to process emails from Gmail and (partially implemented) Outlook, categorize them using OpenAI, and send automated replies.

## Prerequisites

1) Node.js and npm (or yarn) installed on your  system.
2) A Redis server running (for BullMQ)

## Installation 

1) Clone the repository
2) Install dependencies using "npm i"

## Configure:

1) Create a .env file in the project root directory.
2) Add the environment variables to the .env file, replacing placeholders with your actual credentials

```GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri
OUTLOOK_CLIENT_ID=your_outlook_client_id (optional)
OUTLOOK_CLIENT_SECRET=your_outlook_client_secret (optional)
OUTLOOK_TENANT_ID=your_outlook_tenant_id (optional)
OPENAI_API_KEY=your_openai_api_key
REDIS_HOST=your_redis_host (optional, defaults to localhost)
REDIS_PORT=your_redis_port (optional, defaults to 6379) 
```

## Running the Application

1) Start your Redis server if not already running.
2) Run the application 

## Google OAuth2 Authentication

1) Visit http://localhost:3000/auth/google in your web browser to initiate the Google OAuth2 flow.
2) Grant access to your Gmail when prompted
3) Upon successful authorization, you'll be redirected back to the application with a confirmation message.

## Usage

* You can use tools like Postman to send requests to the following API endpoints:
* /fetch-emails: Retrieves unread emails from Gmail (replace with Outlook endpoint for future implementation).
* /process-emails: Triggers email processing for connected accounts (currently only Gmail).

## Additional Notes

* This is a work-in-progress project. Some functionalities like Outlook email processing are not fully implemented yet.
* Refer to the code for more details on functionalities and limitations