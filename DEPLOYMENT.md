# Deploying Event Finder to Vercel

This guide will walk you through the process of deploying your Event Finder application to Vercel.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup) (you can sign up with GitHub, GitLab, or Bitbucket)
2. [Git](https://git-scm.com/downloads) installed on your computer
3. [Node.js](https://nodejs.org/) installed on your computer
4. Your API keys for Perplexity and Gemini

## Step 1: Prepare Your Repository

If you haven't already, initialize a Git repository and commit your code:

```bash
git init
git add .
git commit -m "Initial commit"
```

## Step 2: Install Vercel CLI

Install the Vercel CLI globally:

```bash
npm install -g vercel
```

## Step 3: Login to Vercel

Authenticate with your Vercel account:

```bash
vercel login
```

Follow the prompts to complete the authentication process.

## Step 4: Deploy to Vercel

Run the deployment command:

```bash
vercel
```

During the deployment process, you'll be asked a series of questions:

- Set up and deploy: Yes
- Link to existing project: No (if this is your first deployment)
- Project name: event-finder (or your preferred name)
- Directory: ./ (current directory)
- Override settings: No

## Step 5: Configure Environment Variables

After the initial deployment, you need to set up your environment variables:

1. Go to the [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click on "Settings" tab
4. Click on "Environment Variables"
5. Add the following variables:
   - `PERPLEXITY_API_KEY`: Your Perplexity API key
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `NODE_ENV`: Set to "production"
   - `ALLOWED_ORIGINS`: Your domain (e.g., `https://event-finder.vercel.app`)

## Step 6: Redeploy with Environment Variables

After setting up the environment variables, redeploy your application:

```bash
vercel --prod
```

## Step 7: Verify Deployment

Once deployed, Vercel will provide you with a URL to access your application. Visit the URL to ensure everything is working correctly.

## Troubleshooting

### JSON Parsing Errors

If you encounter errors like `Unexpected token 'T', "The page c"... is not valid JSON`, this typically indicates that:

1. The API is returning HTML instead of JSON (often a Vercel error page)
2. There's an issue with the API keys or environment variables
3. The serverless function is timing out

To fix this:

1. **Check your environment variables**: Make sure all required environment variables are set correctly in the Vercel dashboard.

2. **Verify API keys**: Test your API keys directly with the Perplexity and Gemini APIs to ensure they're valid.

3. **Check function logs**: In the Vercel dashboard, go to your project, then "Deployments" > (select latest deployment) > "Functions" to see logs for your serverless functions.

4. **Test the health endpoint**: Visit `https://your-vercel-domain.vercel.app/api/health` to check if the server is running correctly and has access to the API keys.

5. **Increase function timeout**: If the API requests are timing out, you may need to increase the function timeout in your `vercel.json` file:
   ```json
   {
     "functions": {
       "server.js": {
         "memory": 1024,
         "maxDuration": 60
       }
     }
   }
   ```

6. **Try a different API provider**: Switch between Perplexity and Gemini to see if one works better than the other.

### CORS Issues

If you encounter CORS issues, make sure your `ALLOWED_ORIGINS` environment variable includes the domain where your application is hosted.

### API Key Issues

If the APIs aren't working, verify that your API keys are correctly set in the Vercel environment variables.

### Deployment Failures

Check the Vercel deployment logs for any errors. Common issues include:

- Missing dependencies
- Build errors
- Environment variable issues

## Automatic Deployments

Vercel can automatically deploy your application when you push changes to your Git repository. To set this up:

1. Push your repository to GitHub, GitLab, or Bitbucket
2. Connect your Vercel project to the repository
3. Configure the deployment settings as needed

## Custom Domain

To use a custom domain:

1. Go to your project settings in Vercel
2. Click on "Domains"
3. Add your custom domain
4. Follow the instructions to configure DNS settings

## Conclusion

Your Event Finder application should now be successfully deployed to Vercel. If you make changes to your code, you can redeploy using `vercel --prod` or by pushing to your connected Git repository. 