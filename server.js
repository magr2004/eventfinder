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
        // In development mode, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://yourdomain.com'];
        
        // In production, check against the allowed origins list
        if (allowedOrigins.includes('*') || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parser middleware with size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Input validation middleware
const validateEventRequest = (req, res, next) => {
    const { location, radius, category, apiChoice } = req.body;
    
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
    
    // If all validations pass, continue
    next();
};

// API proxy endpoint with validation
app.post('/api/events', validateEventRequest, async (req, res) => {
    try {
        const { location, radius, category, apiChoice, eventDate } = req.body;
        
        // Choose API based on user selection
        if (apiChoice === 'gemini') {
            await handleGeminiRequest(req, res);
        } else {
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
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`location: ${sanitizedLocation} radius: ${sanitizedRadius} category: ${sanitizedCategory} eventDate: ${eventDate}`);
        }

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

        let query = `Find CURRENT and UPCOMING events happening near ${sanitizedLocation} within ${sanitizedRadius} miles ${timeFrame}. `;

        // If a specific category is requested
        if (sanitizedCategory && sanitizedCategory !== 'all') {
            query += `***Only return ${sanitizedCategory} events or activities. ***`;
        }
        
        query += `Search the internet for the most recent information about these events. ONLY include events that are happening in the future (after today's date which is ${new Date().toLocaleDateString()}). DO NOT include any events from past years or months. Return ONLY a JSON array with each event having these properties: title (string), description (string, keep it brief under 150 characters), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Ensure all events are in the future. Limit to 30 events maximum.`;

        if (process.env.NODE_ENV === 'development') {
            console.log("Query to Perplexity:", query);
        }
        
        // Check if API key exists
        if (!process.env.PERPLEXITY_API_KEY) {
            throw new Error('Perplexity API key is missing');
        }

        // Set cache headers for 15 minutes
        res.setHeader('Cache-Control', 'public, max-age=900');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        try {
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
                            content: `You are a helpful assistant that provides information about local activities and events in JSON format. Always respond with valid JSON only. For each event, include a valid URL to the official event page or ticket page. Categorize each event using one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other. Keep descriptions brief.
                                    Today's date is ${new Date().toLocaleDateString()}. Find CURRENT and UPCOMING events happening near ${sanitizedLocation} within ${sanitizedRadius} miles ${timeFrame}. ${sanitizedCategory !== 'all' ? `Focus on ${sanitizedCategory} events. ` : ''}ONLY include events that are happening in the future (after today's date). DO NOT include any events from past years or months. Return ONLY a JSON array with each event having these properties: title (string), description (string, keep it brief under 150 characters), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Ensure all events are in the future. Limit to 30 events maximum.`
                        },
                        {
                            role: 'user',
                            content: query
                        }
                    ]
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch events from Perplexity API: ${response.status}`);
            }
            
            const data = await response.json();
            res.json(data);
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Request to Perplexity API timed out');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Perplexity API Error:', error);
        res.status(500).json({ error: 'Failed to fetch events from Perplexity' });
    }
}

// Handle Gemini API requests using direct REST API call
async function handleGeminiRequest(req, res) {
    const { location, radius, category, eventDate } = req.body;
    
    try {
        // Sanitize inputs for query construction
        const sanitizedLocation = location.replace(/[^\w\s,-]/g, '').trim();
        const sanitizedRadius = parseInt(radius);
        const sanitizedCategory = category.replace(/[^\w\s&]/g, '').trim();
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`location: ${sanitizedLocation} radius: ${sanitizedRadius} category: ${sanitizedCategory} eventDate: ${eventDate}`);
        }

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

        // Check if API key exists
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key is missing');
        }

        // Build the query
        let query = `Find CURRENT and UPCOMING events happening near ${sanitizedLocation} within ${sanitizedRadius} miles ${timeFrame}. `;
        
        // If a specific category is requested
        if (sanitizedCategory && sanitizedCategory !== 'all') {
            query += `Focus on ${sanitizedCategory} events. `;
        }
        
        query += `Search the internet for the most recent information about these events. ONLY include events that are happening in the future (after today's date which is ${new Date().toLocaleDateString()}). DO NOT include any events from past years or months. Return ONLY a JSON array with each event having these properties: title (string), description (string, keep it brief under 150 characters), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Ensure all events are in the future. Limit to 30 events maximum.`;
        
        if (process.env.NODE_ENV === 'development') {
            console.log("Query to Gemini with web search:", query);
        }

        // Set cache headers for 15 minutes
        res.setHeader('Cache-Control', 'public, max-age=900');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        try {
            // Use the REST API directly without web search
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
                                    text: `You are a helpful assistant that provides information about local activities and events in JSON format. Always respond with valid JSON only. For each event, include a valid URL to the official event page or ticket page. Categorize each event using one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other. Keep descriptions brief.
                                    Today's date is ${new Date().toLocaleDateString()}. Find CURRENT and UPCOMING events happening near ${sanitizedLocation} within ${sanitizedRadius} miles ${timeFrame}. ${sanitizedCategory !== 'all' ? `Focus on ${sanitizedCategory} events. ` : ''}ONLY include events that are happening in the future (after today's date). DO NOT include any events from past years or months. Return ONLY a JSON array with each event having these properties: title (string), description (string, keep it brief under 150 characters), location (string), date (string in Month Day, Year format), category (string - use one of these categories: Music, Sports, Arts & Culture, Food & Drink, Outdoor, Family & Kids, Comedy, Theater & Shows, Festivals, Nightlife, Business & Networking, Education & Learning, Charity & Causes, Health & Wellness, Technology, or Other), address (string), and url (string with a valid URL to the official event page or ticket page). Do not include any explanatory text, just the JSON array. Ensure all events are in the future. Limit to 30 events maximum.`
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 8192
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error Response:', JSON.stringify(errorData, null, 2));
                throw new Error(`Failed to fetch events from Gemini API: ${response.status}`);
            }
            
            const data = await response.json();
            
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
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Request to Gemini API timed out');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ error: 'Failed to fetch events from Gemini' });
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
app.listen(PORT, `0.0.0.0`, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});