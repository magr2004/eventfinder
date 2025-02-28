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
const sortOrderSelect = document.getElementById('sort-order');

// Event listeners
searchBtn.addEventListener('click', searchEvents);
categoryFilter.addEventListener('change', filterEvents);
dateFilter.addEventListener('change', filterEvents);
radiusSelect.addEventListener('change', filterEvents);
sortOrderSelect.addEventListener('change', filterEvents);

// Add enter key support for search
locationInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchEvents();
    }
});

// Add visual feedback on form elements
locationInput.addEventListener('focus', function() {
    this.parentElement.classList.add('focused');
});

locationInput.addEventListener('blur', function() {
    this.parentElement.classList.remove('focused');
});

// Store all events to use for filtering
let allEvents = [];
// Add a request ID to track the latest request
let currentRequestId = 0;

// Client-side input validation
function validateInputs() {
    const location = locationInput.value.trim();
    const radius = parseInt(radiusSelect.value);
    
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
    
    return true;
}

// Show error message with animation
function showError(message) {
    errorMessage.innerHTML = `<p><i class="fas fa-exclamation-circle"></i> ${escapeHTML(message)}</p>`;
    errorMessage.classList.remove('hidden');
    errorMessage.style.animation = 'fadeIn 0.3s ease-in-out';
    loadingElement.classList.add('hidden');
    
    // Scroll to error message
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Hide error message
function hideError() {
    errorMessage.classList.add('hidden');
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

// Function to validate URLs
function isValidURL(url) {
    try {
        // First, ensure the URL has a protocol
        let urlToValidate = url;
        if (!/^https?:\/\//i.test(urlToValidate)) {
            urlToValidate = 'https://' + urlToValidate;
        }
        
        const urlObj = new URL(urlToValidate);
        
        // Only allow http and https protocols
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// Function to search events
function searchEvents() {
    if (!validateInputs()) {
        return;
    }
    
    // Hide any previous error messages
    hideError();
    
    // Show loading indicator with animation
    loadingElement.style.animation = 'fadeIn 0.3s ease-in-out';
    loadingElement.classList.remove('hidden');
    eventsContainer.innerHTML = '';
    
    // Get input values
    const location = locationInput.value.trim();
    const radius = radiusSelect.value;
    const category = categoryFilter.value;
    const dateFilter = document.getElementById('date-filter').value;
    const apiChoice = apiSelect.value;
    
    // Increment request ID
    const requestId = ++currentRequestId;
    
    // Make API request
    fetch('/api/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            location,
            radius,
            category,
            eventDate: dateFilter,
            apiChoice
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                // Try to parse as JSON first
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || errorData.message || 'Failed to fetch events');
                } catch (e) {
                    // If not valid JSON, check if it's HTML (common for server errors)
                    if (text.includes('<!DOCTYPE html>') || text.includes('<html>')) {
                        throw new Error('Server error occurred. Please try again later.');
                    }
                    // Otherwise just return the text
                    throw new Error(text || 'Failed to fetch events');
                }
            });
        }
        
        // Check content type to ensure we're getting JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Expected JSON response but got ${contentType}`);
        }
        
        return response.json();
    })
    .then(data => {
        // Check if this is still the latest request
        if (requestId !== currentRequestId) {
            console.log('Ignoring outdated request');
            return;
        }
        
        // Hide loading indicator
        loadingElement.classList.add('hidden');
        
        // Extract events from the API response
        let eventsContent;
        
        // Check if we have a valid response structure
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            // This is the structure for both Perplexity and Gemini responses
            eventsContent = data.choices[0].message.content;
            console.log("Extracted events content from API response");
        } else {
            console.error("Unexpected API response structure:", data);
            throw new Error("Invalid response format from API");
        }
        
        // Process and display events
        allEvents = parseEventsFromJSON(eventsContent);
        filterEvents();
    })
    .catch(error => {
        // Check if this is still the latest request
        if (requestId !== currentRequestId) {
            console.log('Ignoring outdated request error');
            return;
        }
        
        // Hide loading indicator
        loadingElement.classList.add('hidden');
        
        // Show error message
        showError(error.message || 'Failed to fetch events. Please try again later.');
        console.error('Error:', error);
    });
}

// Function to parse events from JSON response with additional security
function parseEventsFromJSON(eventsText) {
    try {
        console.log("Parsing events from:", typeof eventsText, eventsText ? eventsText.substring(0, 100) + "..." : "undefined");
        
        // Handle undefined or empty input
        if (!eventsText) {
            console.error('Events text is undefined or empty');
            return [];
        }
        
        // If eventsText is already an array, use it directly
        let eventsData;
        if (Array.isArray(eventsText)) {
            eventsData = eventsText;
        } else {
            // Try to extract JSON array from the text
            // First, try to parse as is
            try {
                eventsData = JSON.parse(eventsText);
            } catch (parseError) {
                console.warn('Initial JSON parse failed, trying to extract JSON array', parseError);
                
                // Try to find JSON array in the text (in case there's extra text)
                const jsonArrayMatch = eventsText.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonArrayMatch) {
                    try {
                        eventsData = JSON.parse(jsonArrayMatch[0]);
                        console.log('Successfully extracted JSON array from text');
                    } catch (extractError) {
                        console.error('Failed to extract JSON array:', extractError);
                        
                        // Fallback: Create a sample event to show the user something
                        return createFallbackEvents();
                    }
                } else {
                    console.error('No JSON array found in response');
                    
                    // Fallback: Create a sample event to show the user something
                    return createFallbackEvents();
                }
            }
        }
        
        if (!Array.isArray(eventsData)) {
            console.error('Events data is not an array:', eventsData);
            
            // Fallback: Create a sample event to show the user something
            return createFallbackEvents();
        }
        
        if (eventsData.length === 0) {
            console.warn('API returned an empty array of events');
            
            // Fallback: Create a sample event to show the user something
            return createFallbackEvents();
        }
        
        console.log(`Found ${eventsData.length} events in the response`);
        
        const currentDate = new Date();
        
        // Process and sanitize each event
        const processedEvents = eventsData
            .map(event => {
                // Create a sanitized event object with all properties as strings
                const sanitizedEvent = {
                    title: String(event.title || 'Untitled Event'),
                    date: String(event.date || 'Date TBD'),
                    location: String(event.location || 'Location TBD'),
                    address: String(event.address || ''),
                    description: String(event.description || ''),
                    category: String(event.category || 'Uncategorized'),
                    url: String(event.url || '')
                };
                
                // Validate URL format
                if (sanitizedEvent.url && !isValidURL(sanitizedEvent.url)) {
                    console.warn(`Invalid URL found: ${sanitizedEvent.url}`);
                    sanitizedEvent.url = '';
                }
                
                // Try to parse the date for better filtering
                sanitizedEvent.parsedDate = parseEventDate(sanitizedEvent.date);
                
                return sanitizedEvent;
            })
            .filter(event => {
                // Filter out events with dates in the past
                if (event.parsedDate) {
                    const isInFuture = event.parsedDate >= currentDate;
                    console.log(`Filtering event: ${event.title}, Date: ${event.parsedDate}, Include: ${isInFuture}`);
                    return isInFuture;
                }
                // If we couldn't parse the date, include the event (benefit of doubt)
                console.log(`Including event with unparseable date: ${event.title}, Date: ${event.date}`);
                return true;
            })
            .sort((a, b) => {
                // Get the current sort order preference
                const sortOrder = sortOrderSelect.value;
                
                // Sort events by date based on user preference
                if (a.parsedDate && b.parsedDate) {
                    // For "recent" (soonest first), use ascending order (a - b)
                    // For "future" (latest first), use descending order (b - a)
                    return sortOrder === 'recent' ? a.parsedDate - b.parsedDate : b.parsedDate - a.parsedDate;
                } else if (a.parsedDate) {
                    return -1; // a has a date, b doesn't, so a comes first
                } else if (b.parsedDate) {
                    return 1; // b has a date, a doesn't, so b comes first
                }
                return 0; // neither has a parseable date, maintain original order
            });
        
        console.log(`Processed ${eventsData.length} events, returning ${processedEvents.length} events`);
        
        // Format dates for display
        processedEvents.forEach(event => {
            if (event.parsedDate) {
                event.formattedDate = event.parsedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                event.date = event.formattedDate;
            }
        });
        
        // If we ended up with no events after filtering, return fallback events
        if (processedEvents.length === 0) {
            console.warn('No events left after filtering, using fallback');
            return createFallbackEvents();
        }
        
        return processedEvents;
    } catch (error) {
        console.error('Error parsing events JSON:', error);
        return createFallbackEvents();
    }
}

// Function to create fallback events when API fails
function createFallbackEvents() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    return [
        {
            title: "API Error - Please Try Again",
            date: "Error retrieving events",
            location: "We encountered an issue fetching events",
            address: "",
            description: "There was a problem retrieving events from our data source. Please try again with a different location or API provider. If the problem persists, try again later.",
            category: "Error",
            url: "",
            parsedDate: tomorrow,
            formattedDate: tomorrow.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            })
        },
        {
            title: "Try Different Search Parameters",
            date: nextWeek.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            location: "Suggestion",
            address: "",
            description: "Try searching with a different location, radius, or category. You can also try switching between Perplexity and Gemini API providers to see different results.",
            category: "Suggestion",
            url: "",
            parsedDate: nextWeek
        }
    ];
}

// Helper function to parse event dates in various formats
function parseEventDate(dateString) {
    if (!dateString) return null;
    
    console.log("Parsing date:", dateString);
    
    // Try to handle various date formats
    
    // Case 1: Standard date format (Month Day, Year)
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            console.log("  Parsed as standard date:", date);
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
        console.log("  Parsed as today:", today);
        return today;
    }
    
    if (lowerDateString.includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        console.log("  Parsed as tomorrow:", tomorrow);
        return tomorrow;
    }
    
    if (lowerDateString.includes('this weekend')) {
        // Find the next Saturday
        const nextSaturday = new Date(today);
        const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
        const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
        nextSaturday.setDate(today.getDate() + daysUntilSaturday);
        console.log("  Parsed as this weekend:", nextSaturday);
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
                    console.log(`  Parsed as ${monthNames[i]} ${day}, ${year}:`, eventDate);
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
            console.log(`  Parsed as ${month+1}/${day}/${year}:`, eventDate);
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
            console.log(`  Parsed as ${year}-${month+1}-${day}:`, eventDate);
            return eventDate;
        }
    }
    
    // Case 6: Check for relative time periods
    if (lowerDateString.includes('next week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        console.log("  Parsed as next week:", nextWeek);
        return nextWeek;
    }
    
    if (lowerDateString.includes('this month')) {
        // Return the current date as we're already in this month
        console.log("  Parsed as this month:", today);
        return today;
    }
    
    // If all parsing attempts fail, return null
    console.log("  Failed to parse date");
    return null;
}

// Function to display events
function displayEvents(events) {
    eventsContainer.innerHTML = '';
    
    if (events.length === 0) {
        showError('No events found matching your criteria. Try adjusting your filters or search location.');
        return;
    }
    
    hideError();
    
    events.forEach(event => {
        const eventCard = document.createElement('div');
        eventCard.className = 'event-card';
        eventCard.style.animation = 'fadeIn 0.5s ease-in-out';
        
        // Create a random gradient background for the card
        const hue = Math.floor(Math.random() * 360);
        eventCard.style.background = `linear-gradient(135deg, hsla(${hue}, 70%, 35%, 0.2), hsla(${hue + 40}, 70%, 25%, 0.2))`;
        
        let eventHTML = `
            <div class="event-details">
                <h2 class="event-title">${escapeHTML(event.title)}</h2>
                <div class="event-date"><i class="far fa-calendar-alt"></i> ${escapeHTML(event.date)}</div>
                <div class="event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHTML(event.location)}</div>
        `;
        
        if (event.address) {
            eventHTML += `<div class="event-address"><i class="fas fa-location-dot"></i> ${escapeHTML(event.address)}</div>`;
        }
        
        if (event.category) {
            eventHTML += `<div class="event-category"><i class="fas fa-tag"></i> ${escapeHTML(event.category)}</div>`;
        }
        
        if (event.description) {
            eventHTML += `<div class="event-description">${escapeHTML(event.description)}</div>`;
        }
        
        if (event.url) {
            eventHTML += `
                <div class="event-link">
                    <a href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer">
                        <i class="fas fa-external-link-alt"></i> More Info
                    </a>
                </div>
            `;
        }
        
        eventHTML += `</div>`;
        eventCard.innerHTML = eventHTML;
        eventsContainer.appendChild(eventCard);
    });
    
    // Scroll to events container
    eventsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Function to filter events
function filterEvents() {
    const category = categoryFilter.value;
    const dateFilter = document.getElementById('date-filter').value;
    const sortOrder = sortOrderSelect.value;
    
    let filteredEvents = [...allEvents];
    
    // Filter by category
    if (category !== 'all') {
        filteredEvents = filteredEvents.filter(event => {
            const eventCategory = event.category.toLowerCase();
            
            // Standardized category mapping
            const categoryMappings = {
                'music': ['music', 'concert', 'band', 'festival', 'performance'],
                'sports': ['sports', 'game', 'match', 'tournament', 'athletic'],
                'arts': ['arts', 'art', 'culture', 'museum', 'gallery', 'exhibition', 'arts & culture'],
                'food': ['food', 'drink', 'dining', 'culinary', 'tasting', 'food & drink'],
                'outdoor': ['outdoor', 'nature', 'hiking', 'park', 'adventure'],
                'family': ['family', 'kid', 'kids', 'children', 'family & kids'],
                'comedy': ['comedy', 'stand-up', 'improv', 'humor'],
                'theater': ['theater', 'theatre', 'show', 'play', 'musical', 'theater & shows'],
                'festivals': ['festival', 'fair', 'celebration', 'carnival'],
                'nightlife': ['nightlife', 'club', 'party', 'bar', 'dance'],
                'business': ['business', 'network', 'networking', 'professional', 'business & networking'],
                'education': ['education', 'learning', 'workshop', 'class', 'seminar', 'education & learning'],
                'charity': ['charity', 'cause', 'fundraiser', 'volunteer', 'charity & causes'],
                'health': ['health', 'wellness', 'fitness', 'yoga', 'meditation', 'health & wellness'],
                'tech': ['tech', 'technology', 'digital', 'coding', 'software', 'hardware']
            };
            
            // Check if the event category contains any of the keywords for the selected category
            if (categoryMappings[category]) {
                return categoryMappings[category].some(keyword => 
                    eventCategory.includes(keyword)
                );
            }
            
            // Fallback to simple matching
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
    
    // Sort events by date based on user preference
    filteredEvents.sort((a, b) => {
        if (a.parsedDate && b.parsedDate) {
            // For "recent" (soonest first), use ascending order (a - b)
            // For "future" (latest first), use descending order (b - a)
            return sortOrder === 'recent' ? a.parsedDate - b.parsedDate : b.parsedDate - a.parsedDate;
        } else if (a.parsedDate) {
            return -1; // a has a date, b doesn't, so a comes first
        } else if (b.parsedDate) {
            return 1; // b has a date, a doesn't, so b comes first
        }
        return 0; // neither has a parseable date, maintain original order
    });
    
    displayEvents(filteredEvents);
}

// Helper function to check if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.focused {
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.3);
    border-radius: var(--border-radius);
}
`;
document.head.appendChild(style);

// Initialize with placeholder text
if (eventsContainer.innerHTML.trim() === '') {
    eventsContainer.innerHTML = `
        <div class="initial-message" style="text-align: center; padding: 50px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 10px;">
            <i class="fas fa-search" style="font-size: 3rem; color: var(--primary-color); margin-bottom: 20px;"></i>
            <h2 style="margin-bottom: 15px; color: white;">Ready to discover events?</h2>
            <p style="color: rgba(255, 255, 255, 0.9);">Enter your location above and click "Find Events" to get started.</p>
        </div>
    `;
}

// Add active state for select wrappers
document.querySelectorAll('.select-wrapper select').forEach(select => {
    // Add focus event to add active class
    select.addEventListener('focus', function() {
        this.closest('.select-wrapper').classList.add('active');
    });
    
    // Add blur event to remove active class
    select.addEventListener('blur', function() {
        this.closest('.select-wrapper').classList.remove('active');
    });
    
    // Add change event to highlight selected options
    select.addEventListener('change', function() {
        // First remove active from all options in this group
        const allSelects = document.querySelectorAll('.select-wrapper select');
        allSelects.forEach(s => {
            if (s !== this && s.id !== 'api-select') {
                s.closest('.select-wrapper').classList.remove('has-value');
            }
        });
        
        // Add active class if a non-default value is selected
        if (this.selectedIndex > 0 || 
            (this.id === 'radius-select' && this.value !== '10') ||
            (this.id === 'sort-order' && this.value !== 'recent') ||
            (this.id === 'api-select' && this.value !== 'perplexity')) {
            this.closest('.select-wrapper').classList.add('has-value');
        } else {
            this.closest('.select-wrapper').classList.remove('has-value');
        }
    });
    
    // Initialize active state for pre-selected values
    if (select.selectedIndex > 0 || 
        (select.id === 'radius-select' && select.value !== '10') ||
        (select.id === 'sort-order' && select.value !== 'recent') ||
        (select.id === 'api-select' && select.value !== 'perplexity')) {
        select.closest('.select-wrapper').classList.add('has-value');
    }
}); 