require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
// Comment out or remove security middleware imports until you can install them
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');

const app = express();
const PORT = process.env.PORT || 3000;

// Comment out security middleware
app.use(helmet());
app.use(xss());
app.use(hpp());

// Comment out rate limiting
const limiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 30 minutes'
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
    origin: function(origin, callback) {
        // In production, check against allowed origins
        if (process.env.NODE_ENV === 'production') {
            const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : [];
            
            // Allow requests with no origin (like mobile apps, curl requests)
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            // In development, allow all origins
            callback(null, true);
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true // Allow cookies if needed
};
app.use(cors(corsOptions));

// Body parser middleware with size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Input validation middleware
const validateEventRequest = (req, res, next) => {
    const { location, radius, category, apiChoice, eventDate } = req.body;
    
    // Validate location (required, string, reasonable length)
    if (!location || typeof location !== 'string' || location.length > 100) {
        return res.status(400).json({ 
            error: 'Invalid location. Please provide a valid location (city or zip code).' 
        });
    }
    
    // Validate radius (number, within reasonable range)
    const radiusNum = parseInt(radius);
    if (isNaN(radiusNum) || radiusNum < 1 || radiusNum > 500) {
        return res.status(400).json({ 
            error: 'Invalid radius. Please provide a number between 1 and 500.' 
        });
    }
    
    // Validate category (string, from allowed list)
    const allowedCategories = ['all', 'music', 'sports', 'arts', 'food', 'outdoor', 
                              'family', 'comedy', 'theater', 'festivals', 'nightlife', 
                              'business', 'education', 'charity', 'health', 'tech'];
    if (category && !allowedCategories.includes(category)) {
        return res.status(400).json({ 
            error: 'Invalid category. Please select from the provided options.' 
        });
    }
    
    // Validate API choice (string, from allowed list)
    const allowedApis = ['perplexity', 'gemini'];
    if (!apiChoice || !allowedApis.includes(apiChoice)) {
        return res.status(400).json({ 
            error: 'Invalid API selection. Please select either Perplexity or Gemini.' 
        });
    }
    
    // Validate eventDate (optional, string, from allowed list)
    const allowedDates = ['all', 'today', 'tomorrow', 'this weekend', 'next week', 'this month'];
    if (eventDate && !allowedDates.includes(eventDate)) {
        return res.status(400).json({ 
            error: 'Invalid date filter. Please select from the provided options.' 
        });
    }
    
    // If all validations pass, continue
    next();
};

// Add a health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        apis: {
            perplexity: !!process.env.PERPLEXITY_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY
        }
    });
});

// API proxy endpoint with validation
app.post('/api/events', validateEventRequest, async (req, res) => {
    try {
        const { location, radius, category, apiChoice, eventDate } = req.body;
        
        // Choose API based on user selection
        if (apiChoice === 'gemini') {
            // Check if Gemini API key exists before proceeding
            if (!process.env.GEMINI_API_KEY) {
                return res.status(500).json({ 
                    error: 'Gemini API key is missing. Please contact the administrator.' 
                });
            }
            await handleGeminiRequest(req, res);
        } else {
            // Check if Perplexity API key exists before proceeding
            if (!process.env.PERPLEXITY_API_KEY) {
                return res.status(500).json({ 
                    error: 'Perplexity API key is missing. Please contact the administrator.' 
                });
            }
            // Default to Perplexity
            await handlePerplexityRequest(req, res);
        }
    } catch (error) {
        console.error('Error:', error);
        // Don't expose detailed error information to client
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Handle Perplexity API requests
async function handlePerplexityRequest(req, res) {
    const { location, radius, category, eventDate } = req.body;
    
    try {
        // Sanitize inputs for query construction
        const sanitizedLocation = location.replace(/[^\w\s,-]/g, '').trim();
        const sanitizedRadius = parseInt(radius);
        const sanitizedCategory = category.replace(/[^\w\s&]/g, '').trim();

        // Build a more specific query based on the date filter
        let timeFrame;
        switch(eventDate) {
            case 'today':
                timeFrame = 'today';
                break;
            case 'tomorrow':
                timeFrame = 'tomorrow';
                break;
            case 'this weekend':
                timeFrame = 'this weekend';
                break;
            case 'next week':
                timeFrame = 'next week';
                break;
            case 'this month':
                timeFrame = 'within the next 30 days';
                break;
            default:
                timeFrame = 'in the next 30 days';
        }

        let query = `Find future events happening near zip code or city ${sanitizedLocation} within ${sanitizedRadius} miles for ${timeFrame}. `;
        
        // If a specific category is requested
        if (sanitizedCategory && sanitizedCategory !== 'all') {
            query += `Focus on ${sanitizedCategory} events. `;
        }
        
        query += `Return ONLY a JSON array with each event having these properties: title (string), description (string), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Don\'t return events older than today.`;
        
        console.log("Query to Perplexity:", query);
        
        // API key check moved to the main route handler
        console.log(query);

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that provides information about local activities and events in JSON format. Always respond with valid JSON only. For each event, include a valid URL to the official event page or ticket page. Categorize each event using one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other. Don\'t return events older than today.'
                    },
                    {
                        role: 'user',
                        content: query
                    }
                ]
            }),
            timeout: 55000 // 55 second timeout (slightly less than client timeout)
        });
        
        // Log response status for debugging
        console.log(`Perplexity API response status: ${response.status}`);
        
        if (!response.ok) {
            // Get the response text for better error logging
            const errorText = await response.text();
            console.error(`Perplexity API error response: ${errorText}`);
            throw new Error(`Failed to fetch events from Perplexity API: ${response.status}`);
        }
        
        // Check content type to ensure we're getting JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error(`Unexpected content type: ${contentType}`);
            const text = await response.text();
            console.error(`Response body: ${text.substring(0, 500)}...`);
            throw new Error(`Expected JSON but got ${contentType}`);
        }
        
        const data = await response.json();
        
        // Validate the response structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid response structure from Perplexity:', JSON.stringify(data).substring(0, 500));
            throw new Error('Invalid response structure from Perplexity API');
        }
        
        res.json(data);
    } catch (error) {
        console.error('Perplexity API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch events from Perplexity',
            message: error.message
        });
    }
}

// Handle Gemini API requests
async function handleGeminiRequest(req, res) {
    const { location, radius, category, eventDate } = req.body;
    
    try {
        // Sanitize inputs for query construction
        const sanitizedLocation = location.replace(/[^\w\s,-]/g, '').trim();
        const sanitizedRadius = parseInt(radius);
        const sanitizedCategory = category.replace(/[^\w\s&]/g, '').trim();
        console.log(`location: ${sanitizedLocation} radius: ${sanitizedRadius} category: ${sanitizedCategory} eventDate: ${eventDate}`);

        // Build a more specific query based on the date filter
        let timeFrame;
        switch(eventDate) {
            case 'today':
                timeFrame = 'today';
                break;
            case 'tomorrow':
                timeFrame = 'tomorrow';
                break;
            case 'this weekend':
                timeFrame = 'this weekend';
                break;
            case 'next week':
                timeFrame = 'next week';
                break;
            case 'this month':
                timeFrame = 'within the next 30 days';
                break;
            default:
                timeFrame = 'in the next 30 days';
        }

        let query = `Find events happening near ${sanitizedLocation} within ${sanitizedRadius} miles ${timeFrame}. `;
        
        // If a specific category is requested
        if (sanitizedCategory && sanitizedCategory !== 'all') {
            query += `Focus on ${sanitizedCategory} events. `;
        }
        
        query += `Return ONLY a JSON array with each event having these properties: title (string), description (string), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Ensure all events are in the future. Don\'t return events older than today.`;
        
        console.log("Query to Gemini:", query);
        
        // API key check moved to the main route handler
        
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `You are a helpful assistant that provides information about local activities and events in JSON format. Always respond with valid JSON only. For each event, include a valid URL to the official event page or ticket page. Categorize each event using one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other. Don\'t return events older than today.

                            ${query}`
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192
                }
            }),
            timeout: 55000 // 55 second timeout (slightly less than client timeout)
        });
        
        // Log response status for debugging
        console.log(`Gemini API response status: ${response.status}`);
        
        if (!response.ok) {
            // Get the response text for better error logging
            const errorText = await response.text();
            console.error(`Gemini API error response: ${errorText}`);
            throw new Error(`Failed to fetch events from Gemini API: ${response.status}`);
        }
        
        // Check content type to ensure we're getting JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error(`Unexpected content type: ${contentType}`);
            const text = await response.text();
            console.error(`Response body: ${text.substring(0, 500)}...`);
            throw new Error(`Expected JSON but got ${contentType}`);
        }
        
        const data = await response.json();
        
        // Validate the response structure
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
            console.error('Invalid response structure from Gemini:', JSON.stringify(data).substring(0, 500));
            throw new Error('Invalid response structure from Gemini API');
        }
        
        // Format Gemini response to match Perplexity structure for client compatibility
        const formattedResponse = {
            choices: [
                {
                    message: {
                        content: data.candidates[0].content.parts[0].text
                    }
                }
            ]
        };
        
        res.json(formattedResponse);
    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch events from Gemini',
            message: error.message
        });
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        error: 'Something went wrong on the server',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Serve the main HTML file for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export the Express API for Vercel
module.exports = app;

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0); 
});