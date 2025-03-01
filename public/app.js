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

// Add event listener for Enter key on location input
locationInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchEvents();
    }
});


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
    errorMessage.querySelector('p').innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

// Search for events
async function searchEvents() {
    // Hide any previous error messages
    errorMessage.classList.add('hidden');
    
    // Validate inputs
    if (!validateInputs()) {
        return;
    }
    
    // Show loading indicator
    eventsContainer.innerHTML = '';
    loadingElement.classList.remove('hidden');
    
    // Get search parameters
    const location = locationInput.value.trim();
    const radius = radiusSelect.value;
    const category = categoryFilter.value;
    const eventDate = dateFilter.value;
    const apiChoice = apiSelect.value;
    
    try {
        // Make API request
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location,
                radius,
                category,
                eventDate,
                apiChoice
            })
        });
        
        // Hide loading indicator
        loadingElement.classList.add('hidden');
        
        if (!response.ok) {
            const errorData = await response.json();
            showError(errorData.error || 'Failed to fetch events. Please try again.');
            return;
        }
        
        const data = await response.json();
        
        // Process the response
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            console.log('Raw API response content:', content);
            
            try {
                // Clean the JSON string before parsing
                const cleanedContent = cleanJsonString(content);
                console.log('Cleaned content:', cleanedContent);
                
                // Try to parse the content as JSON
                allEvents = JSON.parse(cleanedContent);
                
                // Display events
                displayEvents(allEvents);
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError);
                
                // Try a more aggressive approach to extract JSON
                try {
                    // Look for anything that resembles an array of objects
                    const regex = /\[\s*\{\s*"[^"]+"\s*:/;
                    const startMatch = content.match(regex);
                    
                    if (startMatch) {
                        const startIndex = startMatch.index;
                        let bracketCount = 1;
                        let endIndex = startIndex + 1;
                        
                        // Find the matching closing bracket
                        for (let i = startIndex + 1; i < content.length; i++) {
                            if (content[i] === '[') bracketCount++;
                            if (content[i] === ']') bracketCount--;
                            
                            if (bracketCount === 0) {
                                endIndex = i + 1;
                                break;
                            }
                        }
                        
                        let jsonCandidate = content.substring(startIndex, endIndex);
                        console.log('Extracted JSON candidate:', jsonCandidate);
                        
                        // Fix unterminated URLs in the extracted JSON
                        jsonCandidate = fixUnterminatedUrls(jsonCandidate);
                        
                        try {
                            allEvents = JSON.parse(jsonCandidate);
                            displayEvents(allEvents);
                        } catch (finalError) {
                            console.error('Final JSON parsing attempt failed:', finalError);
                            
                            // Last resort: manually fix the JSON by removing problematic entries
                            try {
                                // Try to parse the JSON as an array of objects
                                const eventsArray = extractValidEvents(jsonCandidate);
                                if (eventsArray && eventsArray.length > 0) {
                                    allEvents = eventsArray;
                                    displayEvents(allEvents);
                                } else {
                                    throw new Error('Could not extract valid events');
                                }
                            } catch (lastError) {
                                console.error('Last resort parsing failed:', lastError);
                                eventsContainer.innerHTML = `
                                    <div class="error-parsing">
                                        <p>Could not parse events data. Please try again.</p>
                                        <p>If this problem persists, try a different location or API.</p>
                                    </div>`;
                            }
                        }
                    } else {
                        throw new Error('Could not find JSON array pattern');
                    }
                } catch (extractError) {
                    console.error('Error extracting JSON:', extractError);
                    eventsContainer.innerHTML = `
                        <div class="error-parsing">
                            <p>Could not parse events data. Please try again.</p>
                            <p>If this problem persists, try a different location or API.</p>
                        </div>`;
                }
            }
        } else {
            showError('Invalid response format from the API');
        }
    } catch (error) {
        console.error('Error:', error);
        loadingElement.classList.add('hidden');
        showError('An error occurred while fetching events. Please try again.');
    }
}

// Helper function to clean JSON string from markdown formatting
function cleanJsonString(jsonString) {
    if (!jsonString) return '';
    
    // Remove markdown code blocks
    let cleaned = jsonString.replace(/```json\s*|\s*```/g, '');
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    // Replace invalid control characters
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Handle escaped characters that might be problematic
    cleaned = cleaned.replace(/\\([^"\\\/bfnrtu])/g, '$1');
    
    // Fix unterminated strings by looking for URL patterns without closing quotes
    const urlRegex = /"(https?:\/\/[^"]*?)(?=\s*[,}])/g;
    cleaned = cleaned.replace(urlRegex, '"$1"');
    
    // If the string doesn't start with [ or {, try to find the start of the JSON
    if (!cleaned.startsWith('[') && !cleaned.startsWith('{')) {
        const startBracket = cleaned.indexOf('[');
        const startBrace = cleaned.indexOf('{');
        
        if (startBracket !== -1 && (startBrace === -1 || startBracket < startBrace)) {
            cleaned = cleaned.substring(startBracket);
        } else if (startBrace !== -1) {
            cleaned = cleaned.substring(startBrace);
        }
    }
    
    // If the string doesn't end with ] or }, try to find the end of the JSON
    if (!cleaned.endsWith(']') && !cleaned.endsWith('}')) {
        const endBracket = cleaned.lastIndexOf(']');
        const endBrace = cleaned.lastIndexOf('}');
        
        if (endBracket !== -1 && (endBrace === -1 || endBracket > endBrace)) {
            cleaned = cleaned.substring(0, endBracket + 1);
        } else if (endBrace !== -1) {
            cleaned = cleaned.substring(0, endBrace + 1);
        }
    }
    
    // Try to fix common JSON issues
    try {
        // Test if it's valid JSON already
        JSON.parse(cleaned);
        return cleaned;
    } catch (e) {
        console.log('Initial JSON parsing failed, attempting to fix:', e);
        
        try {
            // Try to extract just the array part using regex
            const jsonMatch = cleaned.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
                let extracted = jsonMatch[0];
                
                // Fix unterminated URLs in the extracted JSON
                extracted = fixUnterminatedUrls(extracted);
                
                return extracted;
            }
            
            // If we can't extract an array, return the cleaned string anyway
            // and let the caller handle the error
            return cleaned;
        } catch (extractError) {
            console.error('Error extracting JSON:', extractError);
            return cleaned;
        }
    }
}

// Helper function to fix unterminated URLs in JSON
function fixUnterminatedUrls(jsonString) {
    // Find all property definitions that look like URLs
    const urlPropertyRegex = /"url"\s*:\s*"(https?:\/\/[^"]*?)(?=\s*[,}]|$)/g;
    
    // Replace with properly terminated URLs
    return jsonString.replace(urlPropertyRegex, (match, url) => {
        // If URL doesn't end with a quote, add one
        return `"url": "${url}"`;
    });
}

// Helper function to extract valid events from a malformed JSON string
function extractValidEvents(jsonString) {
    // Try to extract individual event objects
    const eventRegex = /\{\s*"title"[^}]*\}/g;
    const eventMatches = jsonString.match(eventRegex);
    
    if (!eventMatches) return [];
    
    const validEvents = [];
    
    for (const eventStr of eventMatches) {
        try {
            // Try to fix the event JSON
            let fixedEventStr = eventStr;
            
            // Fix unterminated URLs
            fixedEventStr = fixedEventStr.replace(/"url"\s*:\s*"([^"]*?)(?=\s*[,}]|$)/, '"url": "$1"');
            
            // Ensure the event object ends with a closing brace
            if (!fixedEventStr.trim().endsWith('}')) {
                fixedEventStr = fixedEventStr.trim() + '}';
            }
            
            // Parse the event
            const event = JSON.parse(fixedEventStr);
            validEvents.push(event);
        } catch (e) {
            console.warn('Could not parse event:', eventStr, e);
            // Skip this event and continue with others
        }
    }
    
    return validEvents;
}

// Display events
function displayEvents(events) {
    // Clear previous events
    eventsContainer.innerHTML = '';
    
    // Check if events array is empty
    if (!events || events.length === 0) {
        showError('No events found. Try a different location or filters.');
        return;
    }
    
    // Apply current filter
    const filteredEvents = filterEventsByCategory(events, categoryFilter.value);
    const dateFilteredEvents = filterEventsByDate(filteredEvents, dateFilter.value);
    
    // Sort events based on user preference
    const sortedEvents = sortEvents(dateFilteredEvents, sortOrder.value);
    
    // Display each event
    sortedEvents.forEach((event, index) => {
        // Create event card with animation delay
        const eventCard = document.createElement('div');
        eventCard.className = 'event-card';
        eventCard.style.animationDelay = `${index * 0.05}s`;
        
        // Format date if available
        let formattedDate = 'Date not specified';
        if (event.date) {
            try {
                const eventDate = new Date(event.date);
                if (!isNaN(eventDate.getTime())) {
                    formattedDate = eventDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    
                    // Add time if available
                    if (event.time) {
                        formattedDate += ` at ${event.time}`;
                    }
                }
            } catch (e) {
                console.warn('Error formatting date:', e);
            }
        }
        
        // Create category badge if available
        let categoryBadge = '';
        if (event.category) {
            const categoryClass = `cat-${event.category.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            categoryBadge = `<span class="category-badge ${categoryClass}">${event.category}</span>`;
        }
        
        // Build event card HTML
        eventCard.innerHTML = `
            <div class="event-details">
                <h2 class="event-title">${event.title || event.name || 'Unnamed Event'}</h2>
                
                <div class="event-date">
                    <i class="far fa-calendar-alt"></i>
                    ${formattedDate}
                </div>
                
                <div class="event-location">
                    <i class="fas fa-map-marker-alt"></i>
                    ${event.location || event.venue || 'Location not specified'}
                </div>
                
                ${event.address ? `
                <div class="event-address">
                    <i class="fas fa-location-dot"></i>
                    ${event.address}
                </div>` : ''}
                
                ${event.category ? `
                <div class="event-category">
                    <i class="fas fa-tag"></i>
                    ${categoryBadge}
                </div>` : ''}
                
                <p class="event-description">${event.description || 'No description available'}</p>
                
                ${event.url ? `
                <div class="event-link">
                    <a href="${event.url}" target="_blank" rel="noopener noreferrer">
                        <i class="fas fa-external-link-alt"></i> More Info
                    </a>
                </div>` : ''}
            </div>
        `;
        
        eventsContainer.appendChild(eventCard);
    });
    
    // Show message if no events match the filters
    if (sortedEvents.length === 0) {
        showError('No events match your filters. Try different filter options.');
    }
}

// Filter events by category
function filterEventsByCategory(events, category) {
    if (!category || category === 'all') {
        return events;
    }
    
    return events.filter(event => {
        if (!event.category) return false;
        return event.category.toLowerCase().includes(category.toLowerCase());
    });
}

// Filter events by date
function filterEventsByDate(events, dateFilter) {
    if (!dateFilter || dateFilter === 'all') {
        return events;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeekStart = new Date(today);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    
    const thisWeekendStart = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilWeekend = dayOfWeek === 6 ? 0 : 5 - dayOfWeek;
    thisWeekendStart.setDate(thisWeekendStart.getDate() + daysUntilWeekend);
    
    const thisWeekendEnd = new Date(thisWeekendStart);
    thisWeekendEnd.setDate(thisWeekendEnd.getDate() + 2);
    
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    return events.filter(event => {
        if (!event.date) return true;
        
        try {
            const eventDate = new Date(event.date);
            if (isNaN(eventDate.getTime())) return true;
            
            switch (dateFilter) {
                case 'today':
                    return eventDate.toDateString() === today.toDateString();
                case 'tomorrow':
                    return eventDate.toDateString() === tomorrow.toDateString();
                case 'this weekend':
                    return eventDate >= thisWeekendStart && eventDate <= thisWeekendEnd;
                case 'next week':
                    return eventDate >= nextWeekStart && eventDate <= nextWeekEnd;
                case 'this month':
                    return eventDate <= thisMonthEnd;
                default:
                    return true;
            }
        } catch (e) {
            console.warn('Error filtering by date:', e);
            return true;
        }
    });
}

// Sort events by date
function sortEvents(events, sortOrder) {
    return [...events].sort((a, b) => {
        const dateA = a.date ? new Date(a.date) : new Date(0);
        const dateB = b.date ? new Date(b.date) : new Date(0);
        
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        
        return sortOrder === 'recent' ? dateA - dateB : dateB - dateA;
    });
}

// Filter events based on current filter selections
function filterEvents() {
    if (allEvents.length === 0) return;
    
    const filteredEvents = filterEventsByCategory(allEvents, categoryFilter.value);
    const dateFilteredEvents = filterEventsByDate(filteredEvents, dateFilter.value);
    const sortedEvents = sortEvents(dateFilteredEvents, sortOrder.value);
    
    displayEvents(sortedEvents);
}

// Add animation to event cards when they appear
function addScrollAnimation() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.event-card').forEach(card => {
        observer.observe(card);
    });
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Focus on location input
    locationInput.focus();
    
    // Add animation to event cards
    addScrollAnimation();
}); 