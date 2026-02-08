# Susan AI Chat API Documentation

## Overview

The Susan AI Chat API provides conversational AI capabilities using the Susan Presenter Service. It supports both session-based conversations (with full context from inspection presentations) and standalone chat (direct Gemini fallback).

## Base URL

```
/api/susan
```

## Endpoints

### 1. POST /api/susan/chat

Chat with Susan AI. Supports both session-based and standalone modes.

**Request Body:**

```json
{
  "message": "What is hail damage?",           // Required: User's message
  "sessionId": "session_123456_abc",           // Optional: Presentation session ID
  "slideIndex": 3                              // Optional: Current slide index (defaults to session's current slide)
}
```

**Success Response (Session Mode):**

```json
{
  "success": true,
  "response": "Hail damage occurs when...",
  "metadata": {
    "relatedSlides": [2, 3, 5],
    "followUpSuggestion": "Would you like to know about insurance coverage?",
    "confidence": 95,
    "sessionId": "session_123456_abc",
    "slideIndex": 3
  }
}
```

**Success Response (Fallback Mode):**

```json
{
  "success": true,
  "response": "Hail damage occurs when...",
  "metadata": {
    "mode": "fallback",
    "sessionId": null,
    "slideIndex": null
  }
}
```

**Error Responses:**

- `400 Bad Request`: Message is missing or empty
  ```json
  {
    "success": false,
    "error": "Message is required and must be a non-empty string"
  }
  ```

- `503 Service Unavailable`: Gemini API not configured
  ```json
  {
    "success": false,
    "error": "Susan AI is not available. Gemini API key is not configured."
  }
  ```

- `500 Internal Server Error`: Unexpected error
  ```json
  {
    "success": false,
    "error": "Failed to generate response from Susan AI. Please try again."
  }
  ```

### 2. GET /api/susan/session/:sessionId

Retrieve session information (for debugging/status checking).

**Parameters:**
- `sessionId` (path): The session ID

**Success Response:**

```json
{
  "success": true,
  "session": {
    "id": "session_123456_abc",
    "presentationId": "pres_789",
    "propertyAddress": "123 Main St",
    "homeownerName": "John Doe",
    "startTime": "2026-02-08T12:00:00.000Z",
    "currentSlideIndex": 2,
    "totalSlides": 8,
    "status": "active",
    "messageCount": 15,
    "homeownerConcerns": [
      "Cost concerns",
      "Timeline questions"
    ]
  }
}
```

**Error Response:**

- `404 Not Found`: Session doesn't exist
  ```json
  {
    "success": false,
    "error": "Session not found"
  }
  ```

### 3. POST /api/susan/session/:sessionId/complete

Mark a session as complete.

**Parameters:**
- `sessionId` (path): The session ID

**Success Response:**

```json
{
  "success": true,
  "message": "Session completed successfully"
}
```

**Error Response:**

- `500 Internal Server Error`: Failed to complete session
  ```json
  {
    "success": false,
    "error": "Error message here"
  }
  ```

## Usage Examples

### Standalone Chat (No Session)

```javascript
const response = await fetch('/api/susan/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'What are common signs of wind damage?'
  })
});

const data = await response.json();
console.log(data.response); // Susan's response
```

### Session-Based Chat

```javascript
// During a presentation, with session context
const response = await fetch('/api/susan/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Can you explain the damage on this slide?',
    sessionId: 'session_123456_abc',
    slideIndex: 3
  })
});

const data = await response.json();
console.log(data.response); // Susan's contextual response
console.log(data.metadata.relatedSlides); // [2, 3, 5]
```

### Check Session Status

```javascript
const response = await fetch('/api/susan/session/session_123456_abc');
const data = await response.json();

console.log(`Session has ${data.session.messageCount} messages`);
console.log(`Current slide: ${data.session.currentSlideIndex + 1} of ${data.session.totalSlides}`);
```

### Complete a Session

```javascript
const response = await fetch('/api/susan/session/session_123456_abc/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const data = await response.json();
console.log(data.message); // "Session completed successfully"
```

## Implementation Details

### Session Mode
When a `sessionId` is provided and exists in the Susan Presenter Service:
- Uses full presentation context
- Accesses conversation history
- Provides slide-specific answers
- Tracks homeowner concerns
- Higher quality, contextual responses

### Fallback Mode
When no `sessionId` is provided or session doesn't exist:
- Direct Gemini API call
- Susan persona prompt only
- No presentation context
- General roofing/insurance knowledge
- Still helpful but less specific

## Environment Variables Required

```bash
# Required for the API to function
GEMINI_API_KEY=your-gemini-api-key
# OR
GOOGLE_AI_API_KEY=your-gemini-api-key

# Both variables are checked, either will work
```

## Error Handling

The API gracefully handles:
- Missing/invalid session IDs → Falls back to direct Gemini
- Empty messages → Returns 400 error
- Missing API keys → Returns 503 error with clear message
- Gemini API failures → Returns 500 error
- Service errors → Logs to console, returns error response

## Testing

Run the test suite:

```bash
npm test -- server/routes/__tests__/susanRoutes.test.ts
```

## Integration with Susan Presenter Service

This API is a thin wrapper around the Susan Presenter Service (`services/susanPresenterService.ts`). For advanced features:

- **Slide Narration**: Use `generateSlideNarration(sessionId, slideIndex)`
- **Objection Handling**: Use `handleObjection(sessionId, objection, slideIndex)`
- **Session Initialization**: Use `initPresentationSession(...)`
- **Export Transcripts**: Use `exportSessionTranscript(sessionId)`

See `services/susanPresenterService.ts` for full API.
