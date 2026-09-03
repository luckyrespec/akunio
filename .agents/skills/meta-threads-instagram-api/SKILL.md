---
name: meta-threads-instagram-api
description: Use when building applications, agents, or integrations with Meta Threads Graph API (graph.threads.net) or Instagram Graph API (graph.facebook.com), including OAuth 2.0 token management, two-step container publishing, carousel threads, reels, webhooks, replies moderation, keyword search, trending topics, and profile/media insights.
---

# Meta Threads & Instagram Graph API Guide

Comprehensive architectural and engineering guide for building production applications integrating Meta Threads and Instagram Graph APIs.

## Overview
Meta provides two distinct Graph API architectures for its modern social platforms:
1. **Threads Graph API (`https://graph.threads.net/v1.0`)**: Direct user-based OAuth with 2-step media container publishing, 500-char limits, reply moderation, keyword search, trending topics, and 60-day refreshable tokens.
2. **Instagram Graph API (`https://graph.facebook.com/v21.0`)**: Facebook Login / Page-linked Business & Creator accounts with media container publishing (photos, carousels, reels, stories), DM messaging automation, and comment management.

---

## When to Use
- Developing social media management tools, automated schedulers, or cross-posting agents for Threads and Instagram.
- Implementing OAuth authorization, token exchange (short-lived to 60-day long-lived), and token auto-refresh workflows.
- Publishing text, image, video, or multi-item carousel threads and Instagram reels.
- Retrieving official account analytics (`threads_manage_insights`, `instagram_manage_insights`).
- Implementing automated reply management, keyword listening, or Meta webhook subscriptions.

---

## Quick Reference Matrix

| Feature | Threads Graph API | Instagram Graph API |
| :--- | :--- | :--- |
| **Base URL** | `https://graph.threads.net/v1.0` | `https://graph.facebook.com/v21.0` |
| **Auth System** | Direct Threads OAuth (`threads.net/oauth/authorize`) | Facebook Login / Page Access Token |
| **Token Validity** | Short: 1h, Long: 60 days (Refreshable) | User: 60 days, Page Token: Never expires |
| **Text Post Limit** | **500 characters** | 2,200 characters caption |
| **Publishing Flow** | 2-step Container (`/threads` -> `/threads_publish`) | 2-step Container (`/media` -> `/media_publish`) |
| **Carousel Items** | Up to 10 items (images/videos) | Up to 10 items (photos/videos) |
| **Publishing Limit** | 250 posts / 24h, 1,000 replies / 24h | 100 API posts / 24h |
| **Key Scopes** | `threads_basic`, `threads_content_publish`, `threads_manage_insights` | `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` |

---

## Core Implementation Patterns

### 1. Two-Step Publishing Protocol (Threads)
Every post on Threads requires container creation followed by container publishing:

```typescript
// 1. Create Media Container
const containerRes = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    media_type: "TEXT_POST",
    text: "Building autonomous AI agents with Meta Threads API!",
  }),
});
const { id: creationId } = await containerRes.json();

// 2. Publish the Container
const publishRes = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ creation_id: creationId }),
});
const { id: publishedPostId } = await publishRes.json();
```

### 2. Token Security & Auto-Refresh (AES-256-GCM)
Always encrypt user access tokens before storing in database:
```typescript
import crypto from "crypto";

export function encryptToken(token: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}
```

---

## Common Mistakes & Traps

| Trap | Root Cause | Correct Implementation |
| :--- | :--- | :--- |
| **Publishing Video Immediately** | Video transcoding takes 2–10 seconds | Poll `GET /{CONTAINER_ID}?fields=status` until status is `FINISHED` before calling `/threads_publish`. |
| **Exceeding 500 Chars** | Threads hard-rejects text > 500 chars | Strict slice or chunking guardrail before initiating container creation. |
| **Using Graph Facebook for Threads** | Threads has a dedicated domain | Use `https://graph.threads.net/v1.0`, not `graph.facebook.com`. |
| **Losing 60-Day Token** | Long-lived tokens expire if not refreshed | Schedule cron job to refresh tokens every 30–45 days via `/refresh_access_token`. |
| **Webhook Missing Challenge** | Meta webhook verification fails | Return raw `hub.challenge` string on `GET` endpoint when `hub.verify_token` matches. |

---

## Detailed References
For full endpoint payloads, query parameters, webhooks, and rate limit structures, see:
- [`references/api-reference.md`](references/api-reference.md)
