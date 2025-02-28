# Event Finder

A web application that uses AI APIs (Perplexity and Gemini) to find local events based on location, category, and date preferences.

## Features

- Search for events by location (city or zip code)
- Filter events by category and date
- Sort events by date (soonest first or latest first)
- Choose between different AI providers (Perplexity or Gemini)
- Modern, responsive UI with dropdown filters

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- APIs: Perplexity AI, Google Gemini
- Deployment: Vercel

## Deployment to Vercel

### Prerequisites

1. Create a [Vercel account](https://vercel.com/signup)
2. Install the Vercel CLI: `npm install -g vercel`

### Steps to Deploy

1. Login to Vercel CLI:
   ```
   vercel login
   ```

2. Deploy the application:
   ```
   vercel
   ```

3. For production deployment:
   ```
   vercel --prod
   ```

### Environment Variables

Set the following environment variables in the Vercel dashboard:

- `PERPLEXITY_API_KEY`: Your Perplexity API key
- `GEMINI_API_KEY`: Your Google Gemini API key
- `NODE_ENV`: Set to "production"
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with the required environment variables
4. Run the development server: `npm run dev`

## License

MIT 