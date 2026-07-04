# Solveo

Solveo is a customer support agent platform for hotels. Guests can contact the hotel through WhatsApp, Telegram, or voice notes, and an AI agent answers common questions, collects requests, and escalates conversations to hotel staff when needed.

The product has four main parts:

1. Guest messaging experience through WhatsApp and Telegram
2. Voice-note handling for guests who prefer speaking
3. Hotel dashboard for monitoring chats, questions, and escalations
4. Public landing page explaining and selling the product to hotels

## Product Goal

Hotels receive many repeated guest questions about check-in, breakfast, parking, spa access, room service, local recommendations, and policies. Solveo should reduce front-desk workload while keeping staff in control of sensitive or unresolved conversations.

The system should:

- Answer guest questions automatically using hotel-specific knowledge
- Support both text messages and voice notes
- Work through familiar channels like WhatsApp and Telegram
- Let hotel staff see all AI conversations in one dashboard
- Highlight unanswered questions, escalations, and common topics
- Make it easy for hotels to update their information

## Core User Flows

### Guest Flow

1. Guest sends a WhatsApp or Telegram message to the hotel.
2. The message is received by Solveo through a channel webhook.
3. If the message is a voice note, it is transcribed first.
4. The AI agent checks the hotel knowledge base and conversation context.
5. The agent replies in the same channel.
6. If the request needs human help, the conversation is escalated to hotel staff.

### Hotel Staff Flow

1. Staff logs into the hotel dashboard.
2. Staff sees active conversations, resolved conversations, and escalated chats.
3. Staff can inspect full chat history between the guest and AI agent.
4. Staff can take over a conversation when needed.
5. Staff can review common questions and gaps in the AI knowledge base.

### Sales Flow

1. A hotel manager visits the landing page.
2. They understand what Solveo does and which channels it supports.
3. They request a demo or sign up.
4. A new hotel workspace is created and configured.

## Proposed Repository Structure

```text
solveo/
  README.md
  LICENSE

  apps/
    landing/
      # Public marketing website for hotel customers

    dashboard/
      # Hotel-facing web platform for chats, analytics, and settings

    api/
      # Backend API, auth, hotel workspaces, webhooks, and agent orchestration

  packages/
    ai-agent/
      # Prompting, tools, retrieval, escalation logic, and response generation

    channels/
      # WhatsApp, Telegram, and future messaging integrations

    database/
      # Database schema, migrations, seeds, and typed database client

    shared/
      # Shared types, validation schemas, config helpers, and constants

  docs/
    architecture.md
    agent.md
    integrations.md
    data-model.md
```

This structure keeps the public website, hotel dashboard, backend, and agent logic separate while still allowing shared types and utilities.

## Main Components

### Landing Page

The landing page is the public-facing website for hotels.

Initial sections:

- Hero explaining the hotel AI support agent
- WhatsApp, Telegram, and voice-note support
- Dashboard preview
- Use cases such as check-in, amenities, policies, and local recommendations
- Demo request or signup call to action

### Hotel Dashboard

The dashboard is the operational platform for hotel staff.

Initial features:

- Conversation inbox
- AI-handled, escalated, and resolved chat filters
- Chat detail view with guest messages and AI replies
- Staff takeover option
- Question analytics and repeated topics
- Knowledge base management
- Channel connection settings

### Backend API

The backend coordinates users, hotels, messaging webhooks, conversations, and the AI agent.

Initial responsibilities:

- Receive WhatsApp and Telegram webhooks
- Normalize incoming messages into one internal format
- Store conversations and messages
- Send messages back through the correct channel
- Trigger speech-to-text for voice notes
- Call the AI agent package
- Manage auth, hotel workspaces, and permissions

### AI Agent

The AI agent answers guests using hotel-specific information and conversation context.

Initial responsibilities:

- Understand guest intent
- Retrieve hotel-specific knowledge
- Generate concise replies
- Ask follow-up questions when needed
- Detect when human escalation is required
- Produce structured metadata such as topic, confidence, and escalation reason

Example escalation cases:

- Payment or refund disputes
- Complaints requiring staff attention
- Medical or safety emergencies
- Booking changes that need system access
- Low-confidence answers

### Messaging Channels

Solveo should support channel-specific integrations behind one shared interface.

Initial channels:

- WhatsApp Business Platform
- Telegram Bot API

Future channels:

- Website chat widget
- Email
- Instagram direct messages

## Suggested Data Model

Core entities:

- `Hotel`: hotel workspace and business settings
- `User`: dashboard user account
- `Guest`: external guest identity from WhatsApp, Telegram, or another channel
- `Conversation`: one support thread between a guest and hotel
- `Message`: individual guest, AI, or staff message
- `KnowledgeArticle`: hotel-specific source of truth for AI replies
- `Escalation`: record of a conversation needing human attention
- `ChannelConnection`: WhatsApp, Telegram, or future channel configuration

## AI Agent Inputs and Outputs

### Input

```json
{
  "hotelId": "hotel_123",
  "conversationId": "conv_123",
  "channel": "whatsapp",
  "messageType": "text",
  "messageText": "What time is breakfast?",
  "guestLanguage": "en",
  "conversationHistory": [],
  "hotelKnowledge": []
}
```

### Output

```json
{
  "reply": "Breakfast is served daily from 7:00 to 10:30 in the main restaurant.",
  "topic": "breakfast",
  "confidence": 0.94,
  "shouldEscalate": false,
  "escalationReason": null
}
```

## Implementation Phases

### Phase 1: Foundation

- Create backend API
- Create database schema
- Add hotel workspace model
- Add conversation and message storage
- Add basic dashboard shell
- Add first landing page

### Phase 2: Messaging MVP

- Add Telegram bot integration
- Add WhatsApp webhook integration
- Normalize incoming messages
- Send outbound replies
- Store full chat history

### Phase 3: AI Agent MVP

- Add AI response generation
- Add hotel knowledge base retrieval
- Add escalation detection
- Add topic tagging and confidence scores
- Show AI conversations in dashboard

### Phase 4: Voice Notes

- Download voice notes from supported channels
- Transcribe audio to text
- Pass transcription to AI agent
- Store original audio metadata and transcription
- Display voice-note messages in the dashboard

### Phase 5: Hotel Operations

- Add staff takeover
- Add conversation assignment
- Add resolved and archived states
- Add analytics for common questions
- Add knowledge base gap detection

## Open Technical Decisions

- Frontend framework for landing page and dashboard
- Backend framework and hosting provider
- Database provider
- Authentication provider
- WhatsApp provider: direct Meta API or provider such as Twilio
- Speech-to-text provider
- Vector database or retrieval strategy for hotel knowledge
- Multi-language support strategy

## Development Principles

- Keep guest messaging reliable before adding advanced automation
- Store complete conversation history for auditability
- Make AI actions visible to hotel staff
- Escalate uncertain or sensitive cases instead of forcing an answer
- Keep channel integrations behind a common interface
- Treat each hotel as a separate workspace with isolated data

## Current Status

This repository currently contains the initial planning README. The next step is to choose the technical stack and scaffold the first application structure.
