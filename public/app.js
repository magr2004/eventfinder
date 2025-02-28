// DOM elements
const locationInput = document.getElementById('location-input');
const searchBtn = document.getElementById('search-btn');
const categoryFilter = document.getElementById('category-filter');
const dateFilter = document.getElementById('date-filter');
const eventsContainer = document.getElementById('events-container');
const loadingElement = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const apiSelect = document.getElementById('api-select');
const radiusSelect = document.getElementById('radius-select');
const sortOrder = document.getElementById('sort-order');

// Event listeners
searchBtn.addEventListener('click', searchEvents);
categoryFilter.addEventListener('change', filterEvents);
dateFilter.addEventListener('change', filterEvents);
radiusSelect.addEventListener('change', filterEvents);
sortOrder.addEventListener('change', filterEvents);

// Store all events to use for filtering
let allEvents = [];

// Client-side input validation
function validateInputs() {
    const location = locationInput.value.trim();
    const radius = parseInt(radiusSelect.value);
    const sort = sortOrder.value;
    
    // Validate location
    if (!location) {
        showError('Please enter a location (city or zip code)');
        return false;
    }
    
    if (location.length > 100) {
        showError('Location is too long. Please enter a shorter location name.');
        return false;
    }
    
    // Validate radius
    if (isNaN(radius) || radius < 1 || radius > 500) {
        showError('Please select a valid radius');
        return false;
    }
    
    // Validate sort order
    if (sort !== 'recent' && sort !== 'future') {
        showError('Invalid sort order');
        return false;
    }
    
    return true;
}

// Show error message
function showError(message) {
    errorMessage.innerHTML = `<p><i class="fas fa-exclamation-circle"></i> ${escapeHTML(message)}</p>`;
    errorMessage.classList.remove('hidden');
    loadingElement.classList.add('hidden');
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Function to search for events using our backend API
async function searchEvents() {
    // Validate inputs before proceeding
    if (!validateInputs()) {
        return;
    }
    
    const location = locationInput.value.trim();
    const radius = parseInt(radiusSelect.value);
    const category = categoryFilter.value;
    const apiChoice = apiSelect.value;
    const eventDate = dateFilter.value;

    // Show loading spinner
    loadingElement.classList.remove('hidden');
    eventsContainer.innerHTML = '';
    errorMessage.classList.add('hidden');
    
    try {
        // Add a timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location,
                radius,
                category,
                apiChoice,
                eventDate
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId); // Clear the timeout if the request completes
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch events');
        }
        
        const data = await response.json();
        
        // Validate the response structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
            throw new Error('Invalid response format from server');
        }
        
        const eventsText = data.choices[0].message.content;
        
        // Parse the events from the JSON response
        allEvents = parseEventsFromJSON(eventsText);
        
        if (allEvents.length === 0) {
            showError('No events found. Please try a different location or filters.');
        } else {
            displayEvents(allEvents);
        }
    } catch (error) {
        console.error('Error fetching events:', error);
        
        if (error.name === 'AbortError') {
            showError('Request timed out. Please try again later.');
        } else {
            showError(error.message || 'Failed to fetch events. Please try again later.');
        }
    } finally {
        loadingElement.classList.add('hidden');
    }
}

// Function to parse events from JSON response with additional security
function parseEventsFromJSON(eventsText) {
    try {
        // Only log in development mode
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // Clean the text to ensure it's valid JSON
        let cleanedText = eventsText.trim();
        // Remove any markdown code block markers if present
        cleanedText = cleanedText.replace(/```json\s*|\s*```/g, '');
        
        // Try to find a JSON array in the text if it's not already valid JSON
        if (!cleanedText.startsWith('[') && !cleanedText.startsWith('{')) {
            const jsonMatch = cleanedText.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
                cleanedText = jsonMatch[0];
            }
        }
        
        if (isDev) console.log("Cleaned text length:", cleanedText.length);
        
        // Parse the JSON
        let eventsData;
        try {
            eventsData = JSON.parse(cleanedText);
        } catch (parseError) {
            if (isDev) console.error("JSON parse error:", parseError);
            // Try to extract JSON from text if it's embedded in other content
            const jsonMatch = cleanedText.match(/\[.*\]/s);
            if (jsonMatch) {
                try {
                    eventsData = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    if (isDev) console.error("Failed to extract JSON:", e);
                    return [];
                }
            } else {
                return [];
            }
        }
        
        // Validate that eventsData is an array
        if (!Array.isArray(eventsData)) {
            if (isDev) console.error('Events data is not an array:', typeof eventsData);
            // If it's an object with an events property that is an array, use that
            if (eventsData && Array.isArray(eventsData.events)) {
                eventsData = eventsData.events;
            } else {
                return [];
            }
        }
        
        // Get current date for filtering past events
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // Set to beginning of day for accurate comparison
        
        // Process each event with sanitization and filter out past events
        const processedEvents = eventsData
            .map(event => {
                // Ensure all properties exist and are strings
                const sanitizedEvent = {
                    title: typeof event.title === 'string' ? escapeHTML(event.title) : 'No Title',
                    date: typeof event.date === 'string' ? escapeHTML(event.date) : 'Date not specified',
                    location: typeof event.location === 'string' ? escapeHTML(event.location) : 'Location not specified',
                    address: typeof event.address === 'string' ? escapeHTML(event.address) : 'Address not specified',
                    category: typeof event.category === 'string' ? escapeHTML(event.category) : 'Other',
                    description: typeof event.description === 'string' ? escapeHTML(event.description) : 'No description available',
                    url: typeof event.url === 'string' ? event.url : '#'
                };
                
                // Try to parse the event date
                sanitizedEvent.parsedDate = parseEventDate(sanitizedEvent.date);
                
                // Validate URL
                if (sanitizedEvent.url !== '#') {
                    try {
                        const url = new URL(sanitizedEvent.url);
                        // Only allow http and https protocols
                        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                            sanitizedEvent.url = '#';
                        }
                    } catch (e) {
                        // If URL is invalid, set to '#'
                        sanitizedEvent.url = '#';
                    }
                }
                
                return sanitizedEvent;
            })
            .filter(event => {
                // Filter out events with dates in the past
                if (event.parsedDate) {
                    return event.parsedDate >= currentDate;
                }
                // If we couldn't parse the date, include the event (benefit of doubt)
                return true;
            });
        
        if (isDev) console.log(`Processed ${eventsData.length} events, returning ${processedEvents.length} events`);
        return processedEvents;
    } catch (error) {
        console.error('Error parsing events JSON:', error);
        return [];
    }
}

// Helper function to parse event dates in various formats
function parseEventDate(dateString) {
    if (!dateString) return null;
    
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Try to handle various date formats
    
    // Case 1: Standard date format (Month Day, Year)
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch (e) {
        // Continue to other formats if this fails
    }
    
    // Case 2: Check for "Today", "Tomorrow", etc.
    const lowerDateString = dateString.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (lowerDateString.includes('today')) {
        return today;
    }
    
    if (lowerDateString.includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    
    if (lowerDateString.includes('this weekend')) {
        // Find the next Saturday
        const nextSaturday = new Date(today);
        const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
        const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
        nextSaturday.setDate(today.getDate() + daysUntilSaturday);
        return nextSaturday;
    }
    
    // Case 3: Try to extract date parts using regex
    // Match patterns like "June 15, 2023" or "6/15/2023" or "2023-06-15"
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    
    // Check for month name in the string
    for (let i = 0; i < monthNames.length; i++) {
        if (lowerDateString.includes(monthNames[i])) {
            // Extract day and year using regex
            const dayMatch = lowerDateString.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
            const yearMatch = lowerDateString.match(/\b(20\d{2})\b/);
            
            if (dayMatch) {
                const day = parseInt(dayMatch[1]);
                const month = i;
                const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
                
                const eventDate = new Date(year, month, day);
                if (!isNaN(eventDate.getTime())) {
                    return eventDate;
                }
            }
        }
    }
    
    // Case 4: Check for MM/DD/YYYY format
    const dateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const dateMatch = lowerDateString.match(dateRegex);
    if (dateMatch) {
        const month = parseInt(dateMatch[1]) - 1; // JS months are 0-based
        const day = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        
        const eventDate = new Date(year, month, day);
        if (!isNaN(eventDate.getTime())) {
            return eventDate;
        }
    }
    
    // Case 5: Check for YYYY-MM-DD format
    const isoDateRegex = /(\d{4})-(\d{1,2})-(\d{1,2})/;
    const isoMatch = lowerDateString.match(isoDateRegex);
    if (isoMatch) {
        const year = parseInt(isoMatch[1]);
        const month = parseInt(isoMatch[2]) - 1; // JS months are 0-based
        const day = parseInt(isoMatch[3]);
        
        const eventDate = new Date(year, month, day);
        if (!isNaN(eventDate.getTime())) {
            return eventDate;
        }
    }
    
    // Case 6: Check for relative time periods
    if (lowerDateString.includes('next week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        return nextWeek;
    }
    
    if (lowerDateString.includes('this month')) {
        // Return the current date as we're already in this month
        return today;
    }
    
    // If all parsing attempts fail, return null
    return null;
}

// Function to display events
function displayEvents(events) {
    eventsContainer.innerHTML = '';
    
    if (!events || events.length === 0) {
        showError('No events found. Please try a different location or filters.');
        return;
    }
    
    console.log(`Displaying ${events.length} events`);
    
    // Create a document fragment to improve performance
    const fragment = document.createDocumentFragment();
    
    // Limit the number of events to display at once to improve performance
    const maxEventsToDisplay = 50;
    const eventsToDisplay = events.slice(0, maxEventsToDisplay);
    
    // Add a message if we're limiting the display
    if (events.length > maxEventsToDisplay) {
        const limitMessage = document.createElement('div');
        limitMessage.className = 'limit-message';
        limitMessage.innerHTML = `<p>Showing ${maxEventsToDisplay} of ${events.length} events. Use filters to narrow results.</p>`;
        fragment.appendChild(limitMessage);
    }
    
    eventsToDisplay.forEach(event => {
        const eventCard = document.createElement('div');
        eventCard.className = 'event-card';
        eventCard.dataset.category = event.category.toLowerCase();
        
        // Create the link element with rel="noopener noreferrer" for security
        const linkHtml = event.url && event.url !== '#' 
            ? `<div class="event-link"><a href="${event.url}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> Event Details</a></div>`
            : '';
        
        // Format the date nicely if possible
        let formattedDate = event.date;
        try {
            if (event.parsedDate) {
                formattedDate = event.parsedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            } else if (event.date.match(/\d{4}-\d{2}-\d{2}/)) {
                const dateObj = new Date(event.date);
                formattedDate = dateObj.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
        } catch (e) {
            console.error("Error formatting date:", e);
            // Keep original date format if parsing fails
        }
        
        // Use innerHTML with pre-sanitized content
        eventCard.innerHTML = `
            <div class="event-details">
                <h3 class="event-title">${event.title}</h3>
                <div class="event-date"><i class="far fa-calendar-alt"></i> ${formattedDate}</div>
                <div class="event-location"><i class="fas fa-map-marker-alt"></i> ${event.location}</div>
                <div class="event-address"><i class="fas fa-home"></i> ${event.address}</div>
                <div class="event-category"><i class="fas fa-tag"></i> ${event.category}</div>
                ${linkHtml}
                <p class="event-description">${event.description}</p>
            </div>
        `;
        
        fragment.appendChild(eventCard);
    });
    
    // Append all events at once for better performance
    eventsContainer.appendChild(fragment);
}

// Function to filter events
function filterEvents() {
    const category = categoryFilter.value;
    const dateFilter = document.getElementById('date-filter').value;
    const sort = sortOrder.value;
    
    let filteredEvents = [...allEvents];
    
    // Filter by category
    if (category !== 'all') {
        filteredEvents = filteredEvents.filter(event => {
            const eventCategory = event.category.toLowerCase();
            
            // Handle some common category variations
            if (category === 'arts' && (eventCategory.includes('art') || eventCategory.includes('culture') || eventCategory.includes('museum'))) {
                return true;
            }
            if (category === 'food' && (eventCategory.includes('food') || eventCategory.includes('drink') || eventCategory.includes('dining') || eventCategory.includes('culinary'))) {
                return true;
            }
            if (category === 'family' && (eventCategory.includes('family') || eventCategory.includes('kid') || eventCategory.includes('children'))) {
                return true;
            }
            if (category === 'business' && (eventCategory.includes('business') || eventCategory.includes('network') || eventCategory.includes('professional'))) {
                return true;
            }
            
            return eventCategory.includes(category);
        });
    }
    
    // Filter by date
    if (dateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Find the next weekend (Saturday and Sunday)
        const nextSaturday = new Date(today);
        const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
        const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
        nextSaturday.setDate(today.getDate() + daysUntilSaturday);
        
        const nextSunday = new Date(nextSaturday);
        nextSunday.setDate(nextSaturday.getDate() + 1);
        
        // Next week starts on Monday
        const nextMonday = new Date(today);
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        
        const nextSunday2 = new Date(nextMonday);
        nextSunday2.setDate(nextMonday.getDate() + 6);
        
        filteredEvents = filteredEvents.filter(event => {
            // If we have a parsed date, use it for accurate filtering
            if (event.parsedDate) {
                switch (dateFilter) {
                    case 'today':
                        return isSameDay(event.parsedDate, today);
                    case 'tomorrow':
                        return isSameDay(event.parsedDate, tomorrow);
                    case 'this weekend':
                        return (isSameDay(event.parsedDate, nextSaturday) || 
                                isSameDay(event.parsedDate, nextSunday));
                    case 'next week':
                        return (event.parsedDate >= nextMonday && 
                                event.parsedDate <= nextSunday2);
                    case 'this month':
                        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                        return (event.parsedDate >= today && 
                                event.parsedDate <= endOfMonth);
                    default:
                        return true;
                }
            } else {
                // Fallback to text-based filtering if we don't have a parsed date
                const eventDateText = event.date.toLowerCase();
                
                switch (dateFilter) {
                    case 'today':
                        return eventDateText.includes('today');
                    case 'tomorrow':
                        return eventDateText.includes('tomorrow');
                    case 'this weekend':
                        return eventDateText.includes('weekend') || 
                               eventDateText.includes('saturday') || 
                               eventDateText.includes('sunday');
                    case 'next week':
                        return eventDateText.includes('next week');
                    case 'this month':
                        return true; // All events are within this month
                    default:
                        return true;
                }
            }
        });
    }
    
    // Sort events by date
    if (filteredEvents.length > 0) {
        filteredEvents.sort((a, b) => {
            // If we have parsed dates, use them for sorting
            if (a.parsedDate && b.parsedDate) {
                return sort === 'recent' 
                    ? a.parsedDate - b.parsedDate 
                    : b.parsedDate - a.parsedDate;
            }
            // Fallback to string comparison if dates couldn't be parsed
            return 0;
        });
    }
    
    displayEvents(filteredEvents);
}

// Helper function to check if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// Function to get a random event image (not used anymore but kept for compatibility)
function getRandomEventImage() {
    const images = [
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1414525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1533659124865-d6072dc035e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'
    ];
    
    return images[Math.floor(Math.random() * images.length)];
} 