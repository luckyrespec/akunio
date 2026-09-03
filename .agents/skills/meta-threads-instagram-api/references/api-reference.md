# Threads & Instagram Graph API Master Reference

Comprehensive developer guide for Meta Graph API integration across Threads and Instagram Platform.

---

# PART 1: Meta Threads Graph API

Base URL: `https://graph.threads.net/v1.0`

## 1. Official Permissions
- `threads_basic`: Read profile info (username, ID, name, avatar, bio).
- `threads_content_publish`: Create and publish text, images, videos, carousel threads.
- `threads_read_replies`: Read replies and conversation trees.
- `threads_manage_replies`: Hide/unhide replies, control reply moderation.
- `threads_manage_insights`: Retrieve profile & post analytics (views, likes, replies, reposts, quotes, followers).
- `threads_keyword_search`: Search public posts by keyword on behalf of user.
- `threads_trending_topics`: Fetch current trending topics and public discussion clusters.

---

## 2. OAuth 2.0 Authorization Flow

### Step 1: Redirect User to Meta Authorization
```http
GET https://threads.net/oauth/authorize
  ?client_id={META_APP_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=threads_basic,threads_content_publish,threads_read_replies,threads_manage_insights,threads_manage_replies
  &response_type=code
  &state={CSRF_STATE}
```

### Step 2: Exchange Authorization Code for Short-Lived Token
```http
POST https://graph.threads.net/oauth/access_token
Content-Type: application/x-www-form-urlencoded

client_id={META_APP_ID}&
client_secret={META_APP_SECRET}&
grant_type=authorization_code&
redirect_uri={REDIRECT_URI}&
code={AUTHORIZATION_CODE}
```
**Response:**
```json
{
  "access_token": "TH_SHORT_LIVED_TOKEN",
  "user_id": "1234567890"
}
```

### Step 3: Exchange Short-Lived Token for Long-Lived Token (60 Days)
```http
GET https://graph.threads.net/access_token
  ?grant_type=th_exchange_token
  &client_secret={META_APP_SECRET}
  &access_token={TH_SHORT_LIVED_TOKEN}
```
**Response:**
```json
{
  "access_token": "TH_LONG_LIVED_TOKEN_60_DAYS",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

### Step 4: Refresh Long-Lived Token (Before 60 Days Expire)
```http
GET https://graph.threads.net/refresh_access_token
  ?grant_type=th_refresh_token
  &access_token={TH_LONG_LIVED_TOKEN}
```

---

## 3. Two-Step Publishing Protocol

### A. Single Text Post (Max 500 characters)
**1. Create Media Container:**
```http
POST https://graph.threads.net/v1.0/{threads-user-id}/threads
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "media_type": "TEXT_POST",
  "text": "Hello world from Meta Threads Graph API! \n\n#Developer #AI"
}
```
*Returns: `{"id": "CONTAINER_ID"}`*

**2. Publish Container:**
```http
POST https://graph.threads.net/v1.0/{threads-user-id}/threads_publish
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "creation_id": "CONTAINER_ID"
}
```
*Returns: `{"id": "PUBLISHED_POST_ID"}`*

---

### B. Image / Video Post
```http
POST https://graph.threads.net/v1.0/{threads-user-id}/threads
{
  "media_type": "IMAGE",
  "image_url": "https://example.com/image.jpg",
  "text": "Check out this visual breakdown:"
}
```
*Wait for video status to become `FINISHED` before publishing:*
```http
GET https://graph.threads.net/v1.0/{CONTAINER_ID}?fields=status,error_message
```

---

### C. Carousel Multi-Item Post (Up to 10 items)
1. Create child item containers:
```http
POST https://graph.threads.net/v1.0/{threads-user-id}/threads
{ "media_type": "IMAGE", "image_url": "https://example.com/slide1.jpg", "is_carousel_item": true }
```
2. Create carousel parent container:
```http
POST https://graph.threads.net/v1.0/{threads-user-id}/threads
{
  "media_type": "CAROUSEL",
  "children": ["ITEM_1_ID", "ITEM_2_ID", "ITEM_3_ID"],
  "text": "Full 3-part carousel guide:"
}
```
3. Publish parent container via `/threads_publish`.

---

## 4. Insights & Rate Limits

### Rate Limits Endpoint (`/threads_publishing_limit`)
```http
GET https://graph.threads.net/v1.0/{threads-user-id}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config
```
- **Post Quota:** 250 posts per 24 hours (86,400s).
- **Reply Quota:** 1,000 replies per 24 hours.

### Profile Insights (`/{threads-user-id}/threads_insights`)
```http
GET https://graph.threads.net/v1.0/{threads-user-id}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count
```

### Media Insights (`/{threads-media-id}/insights`)
```http
GET https://graph.threads.net/v1.0/{threads-media-id}/insights?metric=views,likes,replies,reposts,quotes
```

---

# PART 2: Instagram Graph API

Base URL: `https://graph.facebook.com/v21.0`

## 1. Official Permissions
- `instagram_basic`: Read profile info, media list, basic metrics.
- `instagram_content_publish`: Publish photo, video, carousel, reels, and stories.
- `instagram_manage_comments`: Moderate and reply to post comments.
- `instagram_manage_insights`: Retrieve user & media analytics (reach, impressions, saved).
- `instagram_manage_messages`: Direct Messaging (DM) automation and customer support.

---

## 2. Token Exchange & Account Resolution
Unlike Threads (which uses `graph.threads.net`), Instagram Graph API operates under Facebook Page connection:
1. User authorizes Facebook Login with Instagram scopes.
2. Get Connected Instagram Business Account ID:
```http
GET https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username,name,profile_picture_url}
```

---

## 3. Instagram Publishing Workflow

### Single Photo / Video / Reel
1. Create Media Container:
```http
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
{
  "image_url": "https://example.com/photo.jpg",
  "caption": "Exploring new horizons with Instagram Graph API! #tech"
}
```
*(For Reels, set `"media_type": "REELS"`, `"video_url": "https://..."`, `"share_to_feed": true`)*

2. Publish Media:
```http
POST https://graph.facebook.com/v21.0/{ig-user-id}/media_publish
{
  "creation_id": "CONTAINER_ID"
}
```

---

## 4. Webhooks & Real-time Updates

Supported webhook topics for both platforms:
- **Threads Webhooks:** `threads` (new replies, mentions, reposts).
- **Instagram Webhooks:** `comments`, `mentions`, `messages`, `story_insights`.

**Webhook Verification Handshake (`GET`):**
```ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
```
